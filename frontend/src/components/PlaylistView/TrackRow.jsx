import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import audio from '../../audio'

function fmt(secs) {
  if (!secs) return '--:--'
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`
}

export default function TrackRow({ track, index, tracks }) {
  const { currentTrack, isPlaying, playTrack, setIsPlaying } = useStore()
  const isActive = currentTrack?.id === track.id
  const canPlay = !!track.is_downloaded

  const handleClick = () => {
    if (!canPlay) return
    if (isActive) {
      // Spotify behavior: clicking the active track always restarts from 0.
      // Play/pause is handled exclusively by the player bar controls.
      audio.currentTime = 0
      setIsPlaying(true)
    } else {
      playTrack(track, { tracks })
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
        transition-colors duration-100
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

      {/* Duration */}
      <span className='text-xs text-spotify-text tabular-nums flex-shrink-0 w-10 text-right'>
        {fmt(track.duration)}
      </span>
    </motion.div>
  )
}
