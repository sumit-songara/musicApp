// ── Config ─────────────────────────────────────────────────────────────────────
// Bump this every release. Must match the "version" field in package.json
// and the tag you create on GitHub (e.g. tag "v2.1.0" for version "2.1.0").

const APP_VERSION = '2.1.8'

const RELEASES_API =
  'https://api.github.com/repos/sumit-songara/musicApp/releases/latest'

// ── Version helpers ────────────────────────────────────────────────────────────

function parseVer(v) {
  return String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
}

function isNewer(remote, local) {
  const r = parseVer(remote)
  const l = parseVer(local)
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true
    if (r[i] < l[i]) return false
  }
  return false
}

// ── Public: call once on app startup ──────────────────────────────────────────
// Returns null if up-to-date, or { version, notes, downloadUrl } if an update
// is available. The caller decides how to show the notification.

export async function checkForUpdate() {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!res.ok) return null
    const release = await res.json()

    const remoteVersion = release.tag_name   // e.g. "v2.2.0"
    if (!remoteVersion || !isNewer(remoteVersion, APP_VERSION)) return null

    // Pick the right asset for this OS
    const platform = window.electronAPI?.getPlatform
      ? await window.electronAPI.getPlatform()
      : ''
    const assets = release.assets || []
    let asset = null
    if (platform === 'darwin') {
      asset = assets.find(a => a.name.toLowerCase().endsWith('.dmg'))
    } else if (platform === 'win32') {
      asset = assets.find(a => a.name.toLowerCase().endsWith('.exe'))
    }

    return {
      version:     remoteVersion,
      notes:       (release.body || '').trim(),
      downloadUrl: asset?.browser_download_url || release.html_url,
    }
  } catch {
    // No network, repo not public yet, or rate-limited — silently ignore
    return null
  }
}

// ── Open the download in the user's browser ────────────────────────────────────

export function openDownload(url) {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}
