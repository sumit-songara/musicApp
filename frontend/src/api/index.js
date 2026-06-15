// In Electron (file:// origin) or dev, use absolute URL.
// In web mode (Flask serves the page) relative URLs work fine.
const IS_ELECTRON = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
const BASE = (IS_ELECTRON || import.meta.env.DEV) ? 'http://localhost:7777' : ''

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  getPlaylists: () => req('/api/playlists'),
  getPlaylist: (id) => req(`/api/playlists/${id}`),
  stopPlaylist: (id) => req(`/api/playlists/${id}/stop`, { method: 'POST' }),
  deletePlaylist: (id) => req(`/api/playlists/${id}`, { method: 'DELETE' }),

  startDownload: (url) => req('/api/download', { method: 'POST', body: JSON.stringify({ url }) }),
  addSingle: (url) => req('/api/download/single', { method: 'POST', body: JSON.stringify({ url }) }),

  previewLocalFolder: (path) => req(`/api/local/preview?path=${encodeURIComponent(path)}`),
  scanLocalFolder: (path) => req('/api/local/scan', { method: 'POST', body: JSON.stringify({ path }) }),

  audioUrl: (trackId) => `${BASE}/api/audio/${trackId}`,
  getNetworkInfo: () => req('/api/network'),
}

export function createProgressSource(downloadId) {
  return new EventSource(`${BASE}/api/download/progress/${downloadId}`)
}
