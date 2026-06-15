const { app, BrowserWindow, shell, ipcMain } = require('electron')
const { spawn, execSync } = require('child_process')
const path = require('path')
const http = require('http')
const fs   = require('fs')
const os   = require('os')

const PORT = 7777
let mainWindow   = null
let flaskProcess = null
let flaskReady   = false
let restartCount = 0
const MAX_RESTARTS = 5

// ── Resolve resource paths ────────────────────────────────────────────────────
const RES = process.resourcesPath

function bundledPath(...parts) { return path.join(RES, ...parts) }
function devPath(...parts)     { return path.join(__dirname, '..', '..', ...parts) }
function pick(bundled, dev)    { return fs.existsSync(bundled) ? bundled : dev }

// Detect the best available Python — try bundled first, then common system paths
function findPython() {
  // Windows standalone (astral-sh install_only layout: python/python.exe)
  if (process.platform === 'win32') {
    const bundledWin = bundledPath('python', 'python.exe')
    if (fs.existsSync(bundledWin)) return bundledWin
  }

  const bundled = bundledPath('python', 'bin', 'python3.11')
  if (fs.existsSync(bundled)) return bundled

  const candidates = [
    '/opt/homebrew/bin/python3.11',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.13',
    '/opt/homebrew/bin/python3.10',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3.11',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3.13',
    '/usr/local/bin/python3.10',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    // Windows
    'C:\\Python311\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Python313\\python.exe',
    'C:\\Python310\\python.exe',
    'python3',
    'python',
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }

  // Last resort: ask the shell
  try {
    const result = execSync(
      process.platform === 'win32' ? 'where python' : 'which python3 || which python',
      { encoding: 'utf8', timeout: 3000 }
    ).split('\n')[0].trim()
    if (result && fs.existsSync(result)) return result
  } catch {}

  return null
}

const PYTHON_BIN    = findPython()
const BACKEND_DIR   = pick(bundledPath('backend'),        devPath('backend'))
const FRONTEND_DIST = pick(bundledPath('frontend-dist'),  devPath('frontend', 'dist'))
// Windows bundles ffmpeg.exe; Mac/Linux bundle the binary as 'ffmpeg'
const FFMPEG_DIR = (() => {
  const win = bundledPath('ffmpeg.exe')
  if (fs.existsSync(win)) return win
  const unix = bundledPath('ffmpeg')
  if (fs.existsSync(unix)) return unix
  return ''
})()

const USER_DATA = app.getPath('userData')
const DOWNLOADS = path.join(os.homedir(), 'Music', 'OfflineBeats')
const DB_PATH   = path.join(USER_DATA, 'musicapp.db')

fs.mkdirSync(DOWNLOADS, { recursive: true })
fs.mkdirSync(USER_DATA, { recursive: true })

console.log('[paths] python:  ', PYTHON_BIN  || '(not found)')
console.log('[paths] backend: ', BACKEND_DIR)
console.log('[paths] frontend:', FRONTEND_DIST)

// ── Kill anything already holding the port ────────────────────────────────────
function freePort(port) {
  try {
    if (process.platform === 'win32') {
      execSync(`FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :${port}') DO TaskKill /PID %P /F`, { shell: true, timeout: 4000 })
    } else {
      execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`, { shell: true, timeout: 4000 })
    }
  } catch { /* nothing was holding the port */ }
}

// ── Start Flask ───────────────────────────────────────────────────────────────
function startFlask() {
  if (flaskProcess) return true   // already running

  if (!PYTHON_BIN) {
    console.error('No Python installation found.')
    return false
  }
  if (!fs.existsSync(BACKEND_DIR)) {
    console.error('Backend not found at', BACKEND_DIR)
    return false
  }

  const extraPaths = [
    path.dirname(PYTHON_BIN),
    FFMPEG_DIR ? path.dirname(FFMPEG_DIR) : '',
  ].filter(Boolean)

  const envPATH = [...extraPaths, process.env.PATH || ''].join(path.delimiter)

  flaskProcess = spawn(PYTHON_BIN, ['app.py'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PATH: envPATH,
      PYTHONUNBUFFERED: '1',
      FLASK_PORT: String(PORT),
      OFFLINEBEATS_FRONTEND: FRONTEND_DIST,
      OFFLINEBEATS_DOWNLOADS: DOWNLOADS,
      OFFLINEBEATS_DB: DB_PATH,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  flaskReady = false
  flaskProcess.stdout.on('data', d => process.stdout.write('[server] ' + d))
  flaskProcess.stderr.on('data', d => process.stderr.write('[server] ' + d))

  flaskProcess.on('exit', (code, signal) => {
    flaskProcess = null
    flaskReady   = false
    console.warn(`[server] exited (code=${code} signal=${signal})`)

    if (signal === 'SIGTERM') return  // intentional shutdown

    if (restartCount < MAX_RESTARTS) {
      restartCount++
      const delay = Math.min(1000 * restartCount, 5000)
      console.log(`[server] restarting in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})…`)
      setTimeout(() => {
        freePort(PORT)
        const ok = startFlask()
        if (ok) {
          waitForFlask()
            .then(() => {
              restartCount = 0
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.loadURL(`http://localhost:${PORT}`)
              }
            })
            .catch(() => showError())
        } else {
          showError()
        }
      }, delay)
    } else {
      showError()
    }
  })

  return true
}

function showError() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, 'error.html'))
  }
}

// ── Wait for Flask to be ready ────────────────────────────────────────────────
function waitForFlask(maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let n = 0
    const check = () => {
      const req = http.get(`http://localhost:${PORT}/api/playlists`, res => {
        res.resume()
        if (res.statusCode < 500) { flaskReady = true; resolve() }
        else retry()
      })
      req.on('error', retry)
      req.setTimeout(800, () => { req.destroy(); retry() })
    }
    const retry = () => ++n < maxAttempts ? setTimeout(check, 500) : reject(new Error('Server did not start'))
    setTimeout(check, 400)
  })
}

// ── Periodic health check — reload window if backend recovers ─────────────────
let healthCheckInterval = null
function startHealthCheck() {
  if (healthCheckInterval) return
  healthCheckInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const req = http.get(`http://localhost:${PORT}/api/playlists`, res => {
      res.resume()
      // If we were broken and it's back, reload
      if (!flaskReady && res.statusCode < 500) {
        flaskReady = true
        mainWindow.loadURL(`http://localhost:${PORT}`)
      }
    })
    req.on('error', () => {
      if (flaskReady) {
        flaskReady = false  // mark as down; auto-restart will recover it
      }
    })
    req.setTimeout(1000, () => req.destroy())
  }, 5000)
}

// ── Create window ─────────────────────────────────────────────────────────────
async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#121212',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'loading.html'))
  mainWindow.show()

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  try {
    // If Flask is already running (e.g. user reopened window), skip startup
    if (!flaskProcess) {
      freePort(PORT)
      const ok = startFlask()
      if (!ok) throw new Error('Could not start server')
    }
    await waitForFlask()
    mainWindow.loadURL(`http://localhost:${PORT}`)
    startHealthCheck()
  } catch (err) {
    console.error('Startup failed:', err.message)
    showError()
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    // On macOS: if window was closed (Cmd+W) but app is still in dock, reopen it
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    } else {
      mainWindow.focus()
    }
  })
})

app.on('before-quit', () => {
  if (flaskProcess) {
    flaskProcess.kill('SIGTERM')
    flaskProcess = null
  }
})

app.on('window-all-closed', () => {
  // On Windows/Linux quit immediately; on macOS stay in dock (standard behaviour)
  if (process.platform !== 'darwin') {
    if (flaskProcess) flaskProcess.kill('SIGTERM')
    app.quit()
  }
})

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-version',   () => app.getVersion())
ipcMain.handle('get-platform',  () => process.platform)
ipcMain.handle('open-external', (_, url) => shell.openExternal(url))

// Stubs for setup flow (used by setup.html / preload.js)
ipcMain.handle('setup-status',  () => ({ ready: flaskReady, python: PYTHON_BIN || null }))
ipcMain.handle('install-deps',  () => ({ ok: false, message: 'Use the bundled installer.' }))
ipcMain.handle('setup-complete',() => null)
ipcMain.handle('setup-abort',   () => { app.quit() })
