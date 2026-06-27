import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { api } from '../../api'
import audio from '../../audio'

function fmt(secs) {
  if (!secs) return '--:--'
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`
}

function TrackMenu({ onRedownload, onDelete, onClose }) {
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className='absolute right-0 top-full mt-1 z-50 bg-[#282828] rounded-md shadow-xl
                 border border-white/10 py-1 min-w-[150px]'
    >
      <button
        onClick={(e) => { e.stopPropagation(); onRedownload(); onClose() }}
        className='w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors'
      >
        Re-download
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose() }}
        className='w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors'
      >
        Delete
      </button>
    </div>
  )
}

export default function TrackRow({ track, index, tracks, onTrackDeleted }) {
  const { currentTrack, isPlaying, playTrack, setIsPlaying, showToast } = useStore()
  const isActive = currentTrack?.id === track.id
  const canPlay = !!track.is_downloaded
  const [menuOpen, setMenuOpen] = useState(false)

  const handleClick = () => {
    if (!canPlay) return
    if (isActive) {
      audio.currentTime = 0
      setIsPlaying(true)
    } else {
      playTrack(track, { tracks })
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Remove "${track.title}" from this playlist?`)) return
    try {
      await api.deleteTrack(track.playlist_id, track.id)
      onTrackDeleted?.(track.id)
      showToast('Track removed', 'info')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleRedownload = async () => {
    try {
      await api.redownloadTrack(track.playlist_id, track.id)
      showToast('Re-download started', 'info')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.4) }}
      onClick={handleClick}
      className={`
        group flex items-center gap-4 px-4 py-2 rounded-lg select-none
        transition-colors duration-100 relative
        ${canPlay ? 'cursor-pointer hover:bg-white/[0.06]' : 'opacity-40 cursor-default'}
        ${isActive ? 'bg-white/10' : ''}
      `}
    >
      {/* # / visualizer */}
      <div className='w-6 flex-shrink-0 text-center'>
        {isActive && isPlaying ? (
          <div className='now-playing-bars mx-auto w-fit'>
            <span /><span /><span />
          </div>
        ) : (
          <>
            <span className={`text-sm block group-hover:hidden ${isActive ? 'text-spotify-green' : 'text-spotify-text'}`}>
              {index + 1}
            </span>
            {canPlay && (
              <span className='text-white text-sm hidden group-hover:block'>▶</span>
            )}
          </>
        )}
      </div>

      {/* Thumbnail */}
      <div className='w-10 h-10 rounded flex-shrink-0 overflow-hidden bg-spotify-surface shadow-sm'>
        {track.thumbnail
          ? <img src={track.thumbnail} alt='' className='w-full h-full object-cover' />
          : <div className='w-full h-full flex items-center justify-center text-spotify-muted text-sm'>♫</div>
        }
      </div>

      {/* Title + artist */}
      <div className='flex-1 min-w-0'>
        <p className={`text-sm font-medium truncate ${isActive ? 'text-spotify-green' : 'text-white'}`}>
          {track.title}
        </p>
        <p className='text-xs text-spotify-text truncate'>{track.artist}</p>
      </div>

      {/* Duration + ⋮ button */}
      <div className='flex items-center gap-1 flex-shrink-0'>
        <span className='text-xs text-spotify-text tabular-nums w-10 text-right
                         group-hover:opacity-0 transition-opacity duration-100'>
          {fmt(track.duration)}
        </span>
        <div className='relative' onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className='w-7 h-7 flex items-center justify-center text-spotify-text hover:text-white
                       opacity-0 group-hover:opacity-100 transition-opacity rounded'
          >
            ⋮
          </button>
          {menuOpen && (
            <TrackMenu
              onDelete={handleDelete}
              onRedownload={handleRedownload}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}
