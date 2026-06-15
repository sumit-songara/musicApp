import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'

const GREETING = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const SOURCE_GRADIENT = {
  youtube: 'from-red-900/60 to-red-950/20',
  spotify: 'from-green-900/60 to-green-950/20',
  local:   'from-blue-900/60 to-blue-950/20',
}
const SOURCE_ACCENT = {
  youtube: 'text-red-400',
  spotify: 'text-spotify-green',
  local:   'text-blue-400',
}

function PlaylistCard({ pl, index }) {
  const { setQueue, setCurrentTrack, setIsPlaying } = useStore()

  const playAll = (e) => {
    e.preventDefault()
    const tracks = pl.tracks?.filter(t => t.is_downloaded) || []
    if (!tracks.length) return
    setQueue(tracks, 0)
    setCurrentTrack(tracks[0])
    setIsPlaying(true)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
    >
      <Link
        to={`/playlist/${pl.id}`}
        className='playlist-card block bg-spotify-surface rounded-xl p-4 hover:bg-spotify-surface-2
                   transition-all duration-200 group relative overflow-hidden cursor-pointer'
      >
        {/* Gradient tint */}
        <div className={`absolute inset-0 bg-gradient-to-br ${SOURCE_GRADIENT[pl.source] || SOURCE_GRADIENT.local} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

        {/* Art */}
        <div className='relative aspect-square rounded-lg overflow-hidden mb-4 shadow-xl bg-spotify-surface-2'>
          {pl.thumbnail ? (
            <img
              src={pl.thumbnail}
              alt={pl.title}
              className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-500'
            />
          ) : (
            <div className='w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-spotify-surface to-spotify-elevated'>
              🎵
            </div>
          )}
          {/* Play button overlay */}
          <button
            onClick={playAll}
            className='play-overlay absolute bottom-3 right-3 w-11 h-11 rounded-full
                       bg-spotify-green flex items-center justify-center shadow-2xl
                       hover:scale-110 active:scale-95 transition-transform btn-glow'
          >
            <svg width='18' height='18' viewBox='0 0 24 24' fill='black'>
              <path d='M8 5v14l11-7z'/>
            </svg>
          </button>
        </div>

        <div className='relative'>
          <p className='text-white font-bold text-sm truncate leading-tight'>{pl.title}</p>
          <p className='text-spotify-text text-xs mt-1'>
            <span className={SOURCE_ACCENT[pl.source]}>{pl.source}</span>
            {' · '}
            {pl.downloaded_count || 0} tracks
            {pl.status === 'downloading' && (
              <span className='ml-1 text-yellow-400 animate-pulse'>· downloading</span>
            )}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}

export default function Home() {
  const playlists = useStore((s) => s.playlists)
  const setShowAddModal = useStore((s) => s.setShowAddModal)

  const recent = playlists.slice(0, 6)

  return (
    <div className='min-h-full overflow-y-auto pb-24'>
      {/* Animated gradient hero */}
      <div className='relative overflow-hidden px-6 pt-10 pb-8'>
        <div className='absolute inset-0 pointer-events-none'>
          <div className='absolute top-0 left-1/4 w-96 h-96 rounded-full bg-spotify-green/10 blur-3xl animate-pulse' />
          <div className='absolute top-10 right-1/4 w-64 h-64 rounded-full bg-blue-500/8 blur-3xl animate-pulse' style={{ animationDelay: '1s' }} />
        </div>

        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className='text-4xl font-black text-white mb-1 relative'
        >
          {GREETING()}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className='text-spotify-text text-sm'
        >
          {playlists.length > 0
            ? `${playlists.reduce((s, p) => s + (p.downloaded_count || 0), 0)} tracks ready to play offline`
            : 'Add your first playlist to get started'}
        </motion.p>
      </div>

      {/* Quick-access grid (last 6) */}
      {recent.length > 0 && (
        <div className='px-6 mb-8'>
          <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
            {recent.map((pl) => (
              <Link
                key={pl.id}
                to={`/playlist/${pl.id}`}
                className='flex items-center gap-3 bg-spotify-surface hover:bg-spotify-surface-2
                           rounded-md overflow-hidden transition-colors group h-14'
              >
                <div className='w-14 h-14 flex-shrink-0 bg-spotify-elevated overflow-hidden'>
                  {pl.thumbnail
                    ? <img src={pl.thumbnail} alt='' className='w-full h-full object-cover' />
                    : <div className='w-full h-full flex items-center justify-center text-2xl'>🎵</div>
                  }
                </div>
                <span className='text-white text-sm font-bold truncate pr-3 group-hover:text-spotify-green transition-colors'>
                  {pl.title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Playlist card grid */}
      {playlists.length > 0 ? (
        <section className='px-6'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-xl font-bold text-white'>Your Library</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className='text-sm text-spotify-text hover:text-white transition-colors'
            >
              Add more
            </button>
          </div>
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'>
            {playlists.map((pl, i) => (
              <PlaylistCard key={pl.id} pl={pl} index={i} />
            ))}
          </div>
        </section>
      ) : (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className='mx-6 rounded-2xl p-10 text-center relative overflow-hidden'
          style={{ background: 'linear-gradient(135deg, #1a472a 0%, #0d2818 60%, #121212 100%)' }}
        >
          <div className='absolute -top-10 -right-10 w-48 h-48 rounded-full bg-spotify-green/10 blur-3xl pointer-events-none' />
          <div className='absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-spotify-green/5 blur-3xl pointer-events-none' />
          <div className='relative z-10'>
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
              className='w-20 h-20 rounded-full bg-spotify-green mx-auto mb-5 flex items-center justify-center shadow-xl shadow-spotify-green/30'
            >
              <span className='text-4xl'>♫</span>
            </motion.div>
            <h2 className='text-2xl font-black text-white mb-2'>Your Offline Music Library</h2>
            <p className='text-spotify-text mb-6 max-w-sm mx-auto text-sm leading-relaxed'>
              Import local music files, or paste a YouTube / Spotify playlist URL to download everything for offline playback.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className='px-8 py-3 rounded-full bg-spotify-green text-black font-bold text-sm btn-glow'
            >
              + Add Music
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
