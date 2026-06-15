import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'

export default function Library() {
  const playlists = useStore((s) => s.playlists)
  const setShowAddModal = useStore((s) => s.setShowAddModal)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className='p-6 pb-24'
    >
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-black text-white'>Your Library</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className='flex items-center gap-2 px-4 py-2 rounded-full bg-spotify-green text-black
                     font-bold text-sm hover:bg-spotify-green-bright transition-colors'
        >
          <span className='text-lg'>+</span> Add Playlist
        </button>
      </div>

      {playlists.length === 0 ? (
        <div className='text-center py-20 text-spotify-text'>
          <p className='text-5xl mb-4'>📭</p>
          <p className='font-bold text-white mb-2'>Your library is empty</p>
          <p className='text-sm mb-6'>Add a YouTube or Spotify playlist to get started.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className='px-6 py-2 rounded-full border border-white/20 text-white text-sm
                       hover:border-white transition-colors'
          >
            Add Playlist
          </button>
        </div>
      ) : (
        <div className='space-y-1'>
          {/* Table header */}
          <div className='grid grid-cols-12 gap-4 px-4 py-2 text-xs text-spotify-text uppercase tracking-widest border-b border-white/10 mb-2'>
            <span className='col-span-6'>Title</span>
            <span className='col-span-2'>Source</span>
            <span className='col-span-2'>Tracks</span>
            <span className='col-span-2'>Status</span>
          </div>

          {playlists.map((pl, i) => (
            <motion.div
              key={pl.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                to={`/playlist/${pl.id}`}
                className='grid grid-cols-12 gap-4 px-4 py-3 rounded-md items-center
                           hover:bg-white/5 transition-colors group'
              >
                {/* Thumbnail + title */}
                <div className='col-span-6 flex items-center gap-3 min-w-0'>
                  <div className='w-10 h-10 rounded flex-shrink-0 overflow-hidden bg-spotify-surface'>
                    {pl.thumbnail ? (
                      <img src={pl.thumbnail} alt='' className='w-full h-full object-cover' />
                    ) : (
                      <div className='w-full h-full flex items-center justify-center text-xl'>🎵</div>
                    )}
                  </div>
                  <span className='text-sm text-white font-medium truncate group-hover:text-spotify-green transition-colors'>
                    {pl.title}
                  </span>
                </div>

                {/* Source */}
                <div className='col-span-2'>
                  <span className={`text-xs font-medium capitalize ${
                    pl.source === 'spotify' ? 'text-spotify-green'
                    : pl.source === 'local' ? 'text-blue-400'
                    : 'text-red-400'
                  }`}>
                    {pl.source}
                  </span>
                </div>

                {/* Tracks */}
                <div className='col-span-2 text-sm text-spotify-text'>
                  {pl.downloaded_count || 0} / {pl.track_count || 0}
                </div>

                {/* Status */}
                <div className='col-span-2'>
                  {pl.status === 'completed' && (
                    <span className='text-xs text-spotify-green font-medium'>✓ Ready</span>
                  )}
                  {pl.status === 'downloading' && (
                    <span className='text-xs text-yellow-400 animate-pulse'>⬇ Downloading</span>
                  )}
                  {pl.status === 'pending' && (
                    <span className='text-xs text-spotify-muted'>Pending</span>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
