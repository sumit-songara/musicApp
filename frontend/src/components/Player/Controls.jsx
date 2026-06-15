import { useStore } from '../../store/useStore'

const Btn = ({ onClick, className = '', title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`transition-all duration-150 hover:scale-110 active:scale-95 ${className}`}
  >
    {children}
  </button>
)

const ShuffleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
  </svg>
)

const RepeatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
  </svg>
)

const RepeatOneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/>
  </svg>
)

export default function Controls() {
  const { isPlaying, shuffle, repeat, setIsPlaying, toggleShuffle, cycleRepeat, playNext, playPrev } = useStore()
  const repeatActive = repeat !== 'off'

  return (
    <div className='flex items-center gap-5 justify-center'>
      {/* Shuffle */}
      <Btn
        onClick={toggleShuffle}
        title='Shuffle'
        className={shuffle ? 'text-spotify-green' : 'text-spotify-text hover:text-white'}
      >
        <ShuffleIcon />
      </Btn>

      {/* Prev */}
      <Btn onClick={playPrev} className='text-spotify-text hover:text-white' title='Previous'>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
        </svg>
      </Btn>

      {/* Play / Pause */}
      <Btn
        onClick={() => setIsPlaying(!isPlaying)}
        className='w-10 h-10 rounded-full bg-white flex items-center justify-center
                   text-black hover:scale-105 hover:bg-spotify-green-bright shadow-lg'
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        )}
      </Btn>

      {/* Next */}
      <Btn onClick={playNext} className='text-spotify-text hover:text-white' title='Next'>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/>
        </svg>
      </Btn>

      {/* Repeat */}
      <Btn
        onClick={cycleRepeat}
        title={`Repeat: ${repeat}`}
        className={repeatActive ? 'text-spotify-green' : 'text-spotify-text hover:text-white'}
      >
        {repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
      </Btn>
    </div>
  )
}
