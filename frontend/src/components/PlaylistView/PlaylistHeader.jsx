import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import { useNavigate } from 'react-router-dom'

const SOURCE_COLOR = { youtube: '#ff4444', spotify: '#1DB954' }
const SOURCE_LABEL = { youtube: 'YouTube Playlist', spotify: 'Spotify Playlist' }
const LIKED_SONGS_URL = '__liked_songs__'

export default function PlaylistHeader({ playlist }) {
  const navigate = useNavigate()
  const { setQueue, setCurrentTrack, setIsPlaying, removePlaylist, upsertPlaylist, showToast,
          downloads, eventSources, removeDownload, unregisterEventSource } = useStore()

  const tracks = playlist.tracks || []
  const downloadedTracks = tracks.filter((t) => t.is_downloaded)
  const isDownloading = playlist.status === 'downloading'

  const playAll = () => {
    if (!downloadedTracks.length) return
    setQueue(downloadedTracks, 0)
    setCurrentTrack(downloadedTracks[0])
    setIsPlaying(true)
  }

  const closeActiveStream = () => {
    const activeDownload = downloads.find((d) => d.playlist_id === playlist.id && d.status === 'running')
    if (activeDownload) {
      const es = eventSources[activeDownload.id]
      if (es) { es.close(); unregisterEventSource(activeDownload.id) }
      removeDownload(activeDownload.id)
    }
  }

  const handleStop = async () => {
    closeActiveStream()
    try {
      const updated = await api.stopPlaylist(playlist.id)
      upsertPlaylist(updated)
      showToast('Download stopped', 'info')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this playlist and all downloaded files?')) return
    closeActiveStream()
    try {
      await api.deletePlaylist(playlist.id)
      removePlaylist(playlist.id)
      navigate('/library')
      showToast('Playlist deleted', 'info')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const isLikedSongs = playlist.url === LIKED_SONGS_URL
  const accentColor = isLikedSongs ? '#8b5cf6' : (SOURCE_COLOR[playlist.source] || '#1DB954')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className='relative overflow-hidden'
      style={{
        background: isLikedSongs
          ? 'linear-gradient(180deg, #5b21b633 0%, #12121200 100%)'
          : `linear-gradient(180deg, ${accentColor}33 0%, #12121200 100%)`,
        paddingTop: '5rem',
      }}
    >
      <div className='px-6 pb-6 flex items-end gap-6'>
        {/* Art */}
        <div
          className={`w-44 h-44 rounded-lg shadow-2xl overflow-hidden flex-shrink-0 flex items-center justify-center
            ${isLikedSongs ? 'bg-gradient-to-br from-purple-700 to-indigo-500' : 'bg-spotify-surface'}`}
          style={{ boxShadow: `0 8px 40px ${accentColor}40` }}
        >
          {isLikedSongs ? (
            <span className='text-7xl text-white'>♥</span>
          ) : playlist.thumbnail ? (
            <img src={playlist.thumbnail} alt='' className='w-full h-full object-cover' />
          ) : (
            <span className='text-6xl'>🎵</span>
          )}
        </div>

        {/* Info */}
        <div className='min-w-0'>
          <p className='text-xs font-bold uppercase tracking-widest text-white/60 mb-1'>
            {isLikedSongs ? 'Liked Songs' : (SOURCE_LABEL[playlist.source] || 'Playlist')}
          </p>
          <h1 className='text-4xl font-black text-white mb-3 leading-tight'>{playlist.title}</h1>
          <p className='text-sm text-spotify-text mb-4'>
            {downloadedTracks.length} / {playlist.track_count || tracks.length} tracks downloaded
            {playlist.status === 'downloading' && (
              <span className='ml-2 text-yellow-400 animate-pulse'>• downloading…</span>
            )}
            {playlist.status === 'stopped' && (
              <span className='ml-2 text-white/40'>• stopped</span>
            )}
          </p>
          <div className='flex items-center gap-3'>
            <button
              onClick={playAll}
              disabled={!downloadedTracks.length}
              className='w-14 h-14 rounded-full bg-spotify-green flex items-center justify-center
                         hover:scale-105 hover:bg-spotify-green-bright transition-all shadow-lg
                         disabled:opacity-40 disabled:cursor-not-allowed pulse-glow'
            >
              <svg width='24' height='24' viewBox='0 0 24 24' fill='black'>
                <path d='M8 5v14l11-7z'/>
              </svg>
            </button>
            {isDownloading ? (
              <button
                onClick={handleStop}
                className='px-4 py-1.5 rounded-full border border-red-500/60 text-sm text-red-400
                           hover:border-red-400 hover:text-red-300 transition-colors'
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleDelete}
                className='px-4 py-1.5 rounded-full border border-white/20 text-sm text-white/70
                           hover:border-white hover:text-white transition-colors'
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
