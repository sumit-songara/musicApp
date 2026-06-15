import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { usePlayer } from '../../hooks/usePlayer'
import { useVisualizer } from '../../hooks/useVisualizer'
import Controls from './Controls'
import SeekBar from './SeekBar'
import VolumeControl from './VolumeControl'

function AlbumArt({ track, isPlaying }) {
  return (
    <div className='relative w-14 h-14 flex-shrink-0'>
      <div
        className={`w-full h-full rounded-lg overflow-hidden bg-spotify-surface shadow-lg
                    transition-all duration-500 ${isPlaying ? 'scale-[1.04] shadow-spotify-green/20 shadow-xl' : 'scale-100'}`}
      >
        {track?.thumbnail ? (
          <img src={track.thumbnail} alt={track.title} className='w-full h-full object-cover' />
        ) : (
          <div className='w-full h-full flex items-center justify-center bg-gradient-to-br from-spotify-surface to-spotify-surface-2'>
            <span className='text-3xl'>♫</span>
          </div>
        )}
      </div>
      {isPlaying && (
        <div className='absolute inset-0 rounded-lg ring-2 ring-spotify-green/50 animate-pulse pointer-events-none' />
      )}
    </div>
  )
}

export default function Player() {
  const { seek } = usePlayer()
  const currentTrack = useStore((s) => s.currentTrack)
  const isPlaying = useStore((s) => s.isPlaying)
  const canvasRef = useVisualizer(isPlaying)

  return (
    <div className='h-full flex items-center px-4 gap-4'>

      {/* Left — track info */}
      <div className='flex items-center gap-3 w-64 min-w-0 flex-shrink-0'>
        <AlbumArt track={currentTrack} isPlaying={isPlaying} />
        <AnimatePresence mode='wait'>
          {currentTrack ? (
            <motion.div
              key={currentTrack.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className='min-w-0'
            >
              <p className='text-sm text-white font-semibold truncate leading-tight'>
                {currentTrack.title}
              </p>
              <p className='text-xs text-spotify-text truncate mt-0.5'>
                {currentTrack.artist}
              </p>
            </motion.div>
          ) : (
            <p className='text-sm text-spotify-muted'>Nothing playing</p>
          )}
        </AnimatePresence>
      </div>

      {/* Center — controls + seek + visualizer */}
      <div className='flex-1 flex flex-col items-center gap-1.5 min-w-0 max-w-xl mx-auto'>
        <Controls />
        <SeekBar seek={seek} />
        {/* Visualizer */}
        <canvas
          ref={canvasRef}
          width={220}
          height={28}
          className='opacity-80'
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* Right — volume */}
      <div className='w-40 flex-shrink-0 flex justify-end'>
        <VolumeControl />
      </div>
    </div>
  )
}
