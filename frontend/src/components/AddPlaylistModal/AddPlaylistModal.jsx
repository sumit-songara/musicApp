import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { api, createProgressSource } from '../../api'
import { useStore } from '../../store/useStore'
import Spinner from '../ui/Spinner'

const TABS = [
  { id: 'local',   icon: '💾', label: 'Local Folder' },
  { id: 'youtube', icon: '▶',  label: 'YouTube'      },
  { id: 'spotify', icon: '●',  label: 'Spotify'      },
]

// ── Local Folder Tab ──────────────────────────────────────────────────────────
function LocalTab({ onClose }) {
  const navigate = useNavigate()
  const { upsertPlaylist, showToast } = useStore()

  const [path, setPath] = useState('~/Music')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      if (!path.trim()) return
      setPreviewing(true)
      api.previewLocalFolder(path.trim())
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false))
    }, 500)
    return () => clearTimeout(t)
  }, [path])

  const handleImport = async () => {
    setError('')
    setLoading(true)
    try {
      const { playlist_id, track_count } = await api.scanLocalFolder(path.trim())
      const pl = await api.getPlaylist(playlist_id)
      upsertPlaylist(pl)
      onClose()
      navigate(`/playlist/${playlist_id}`)
      showToast(`Imported ${track_count} tracks!`, 'success')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const canImport = preview?.valid && preview.count > 0 && !loading

  return (
    <div className='space-y-4'>
      <p className='text-spotify-text text-sm leading-relaxed'>
        Point to a folder on your laptop that contains music files.
        The app will scan it and make everything available to play — no internet needed.
      </p>

      {/* Path input */}
      <div>
        <label className='block text-xs text-spotify-text mb-1.5 font-medium uppercase tracking-wider'>
          Folder Path
        </label>
        <input
          type='text'
          value={path}
          onChange={(e) => { setPath(e.target.value); setError('') }}
          placeholder='~/Music  or  /Users/you/Downloads/Music'
          className='w-full px-4 py-3 rounded-lg bg-spotify-black border border-white/10
                     text-white placeholder-spotify-muted text-sm
                     focus:outline-none focus:border-spotify-green transition-colors font-mono'
        />
        <p className='text-xs text-spotify-muted mt-1.5'>
          Supports MP3, FLAC, M4A, AAC, WAV, OGG. Subfolders included.
        </p>
      </div>

      {/* Preview badge */}
      <AnimatePresence>
        {previewing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className='flex items-center gap-2 text-xs text-spotify-text'>
            <Spinner size={14} /> Scanning…
          </motion.div>
        )}
        {!previewing && preview && (
          <motion.div
            key={preview.count}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium
              ${preview.valid && preview.count > 0
                ? 'bg-spotify-green/10 border border-spotify-green/30 text-spotify-green'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}
          >
            {preview.valid && preview.count > 0 ? (
              <>✓ Found <strong>{preview.count}</strong> audio file{preview.count !== 1 ? 's' : ''} in "{preview.folder}"</>
            ) : (
              <>No audio files found in that folder.</>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className='text-red-400 text-xs'>{error}</p>}

      <div className='flex gap-3 pt-2'>
        <button type='button' onClick={onClose}
          className='flex-1 py-3 rounded-full border border-white/20 text-white text-sm hover:border-white transition-colors'>
          Cancel
        </button>
        <button onClick={handleImport} disabled={!canImport}
          className='flex-1 py-3 rounded-full bg-spotify-green text-black font-bold text-sm
                     hover:bg-spotify-green-bright transition-colors disabled:opacity-40
                     flex items-center justify-center gap-2'>
          {loading ? <><Spinner size={16} color='black' /> Importing…</> : `Import ${preview?.count ? preview.count + ' tracks' : 'Folder'}`}
        </button>
      </div>
    </div>
  )
}

// ── Download Tab (YouTube / Spotify) ─────────────────────────────────────────
function DownloadTab({ source, onClose }) {
  const navigate = useNavigate()
  const { addDownload, updateDownload, upsertPlaylist, showToast, registerEventSource, unregisterEventSource } = useStore()

  const [mode, setMode] = useState('playlist') // 'playlist' | 'song'
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isSong = mode === 'song'
  const sourceName = source === 'youtube' ? 'YouTube' : 'Spotify'

  const placeholder = isSong
    ? (source === 'youtube'
        ? 'https://www.youtube.com/watch?v=…'
        : 'https://open.spotify.com/track/…')
    : (source === 'youtube'
        ? 'https://www.youtube.com/playlist?list=…'
        : 'https://open.spotify.com/playlist/…')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setError('')
    setLoading(true)

    try {
      const apiCall = isSong ? api.addSingle(trimmed) : api.startDownload(trimmed)
      const { download_id, playlist_id } = await apiCall

      addDownload({ id: download_id, playlist_id, track: 'Starting…', percent: '0%', status: 'running' })

      if (isSong) {
        upsertPlaylist({
          id: playlist_id, title: 'Liked Songs', status: 'downloading',
          source, url: '__liked_songs__', track_count: 0, downloaded_count: 0, thumbnail: '',
        })
      } else {
        upsertPlaylist({
          id: playlist_id, title: 'Downloading…', status: 'downloading',
          source, url: trimmed, track_count: 0, downloaded_count: 0, thumbnail: '',
        })
      }

      onClose()
      navigate(`/playlist/${playlist_id}`)
      showToast(isSong ? 'Song download started!' : 'Download started!', 'success')

      const es = createProgressSource(download_id)
      registerEventSource(download_id, es)
      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data)
        if (data.type === 'progress') {
          updateDownload(download_id, { track: data.track, percent: data.percent })
        } else if (data.type === 'track_done') {
          updateDownload(download_id, { track: data.track, percent: '100%' })
        } else if (data.type === 'track_added') {
          updateDownload(download_id, { track: data.track, percent: '100%' })
          api.getPlaylist(playlist_id).then(upsertPlaylist).catch(() => {})
        } else if (data.type === 'error') {
          updateDownload(download_id, { status: 'error', track: data.message })
          showToast(`Download error: ${data.message}`, 'error')
          unregisterEventSource(download_id)
          es.close()
        } else if (data.type === 'done') {
          updateDownload(download_id, { status: 'done', percent: '100%' })
          showToast('Download complete!', 'success')
          unregisterEventSource(download_id)
          es.close()
          api.getPlaylist(playlist_id).then(upsertPlaylist).catch(() => {})
        }
      }
      es.onerror = () => {
        unregisterEventSource(download_id)
        es.close()
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      {/* Playlist / Song toggle */}
      <div className='flex gap-1 bg-spotify-black rounded-lg p-1'>
        {['playlist', 'song'].map((m) => (
          <button
            key={m}
            type='button'
            onClick={() => { setMode(m); setUrl(''); setError('') }}
            className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-all capitalize
              ${mode === m
                ? 'bg-spotify-surface text-white shadow'
                : 'text-spotify-text hover:text-white'}`}
          >
            {m === 'playlist' ? 'Playlist' : 'Single Song'}
          </button>
        ))}
      </div>

      <p className='text-spotify-text text-sm leading-relaxed'>
        {isSong
          ? `Paste a ${sourceName} song URL. It will be downloaded and added to your Liked Songs collection.`
          : `Paste a ${sourceName} playlist URL. All tracks will be downloaded as MP3s for offline playback.`}
      </p>

      <div>
        <input
          type='url'
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError('') }}
          placeholder={placeholder}
          autoFocus
          className='w-full px-4 py-3 rounded-lg bg-spotify-black border border-white/10
                     text-white placeholder-spotify-muted text-sm
                     focus:outline-none focus:border-spotify-green transition-colors'
        />
        {error && <p className='text-red-400 text-xs mt-2'>{error}</p>}
      </div>

      <div className='flex gap-3 pt-2'>
        <button type='button' onClick={onClose}
          className='flex-1 py-3 rounded-full border border-white/20 text-white text-sm hover:border-white transition-colors'>
          Cancel
        </button>
        <button type='submit' disabled={loading || !url.trim()}
          className='flex-1 py-3 rounded-full bg-spotify-green text-black font-bold text-sm
                     hover:bg-spotify-green-bright transition-colors disabled:opacity-40
                     flex items-center justify-center gap-2'>
          {loading
            ? <><Spinner size={16} color='black' /> Starting…</>
            : isSong ? 'Download Song' : 'Download Playlist'}
        </button>
      </div>
    </form>
  )
}

// ── Modal Shell ───────────────────────────────────────────────────────────────
export default function AddPlaylistModal() {
  const setShowAddModal = useStore((s) => s.setShowAddModal)
  const [tab, setTab] = useState('local')

  const close = () => setShowAddModal(false)

  return (
    <AnimatePresence>
      <motion.div key='overlay' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={close}
        className='fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4'>
        <motion.div key='modal'
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className='bg-spotify-elevated rounded-2xl p-8 w-full max-w-md shadow-2xl'>

          <h2 className='text-2xl font-black text-white mb-5'>Add Music</h2>

          {/* Tabs */}
          <div className='flex gap-1 bg-spotify-black rounded-lg p-1 mb-6'>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-semibold transition-all
                  ${tab === t.id
                    ? 'bg-spotify-surface text-white shadow'
                    : 'text-spotify-text hover:text-white'}`}>
                <span className={t.id === 'spotify' ? 'text-spotify-green' : t.id === 'youtube' ? 'text-red-400' : 'text-blue-400'}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AnimatePresence mode='wait'>
            <motion.div key={tab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}>
              {tab === 'local'   && <LocalTab onClose={close} />}
              {tab === 'youtube' && <DownloadTab source='youtube' onClose={close} />}
              {tab === 'spotify' && <DownloadTab source='spotify' onClose={close} />}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
