import { useStore } from '../../store/useStore'

function fmt(secs) {
  if (!secs || isNaN(secs)) return '0:00'
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`
}

export default function SeekBar({ seek }) {
  const progress = useStore((s) => s.progress)
  const duration = useStore((s) => s.duration)
  const pct = Math.min(100, Math.round((progress || 0) * 100))

  return (
    <div className='flex items-center gap-2 w-full'>
      <span className='text-xs text-spotify-text w-8 text-right tabular-nums'>
        {fmt(progress * duration)}
      </span>

      <div className='relative flex-1 h-4 flex items-center group seek-track'>
        {/* Visual track */}
        <div className='w-full h-1 group-hover:h-1.5 transition-all duration-100 rounded-full bg-white/20 relative'>
          {/* Fill */}
          <div
            className='h-full bg-white group-hover:bg-spotify-green transition-colors duration-150 rounded-full'
            style={{ width: `${pct}%` }}
          />
          {/* Thumb dot */}
          <div
            className='seek-thumb'
            style={{ left: `${pct}%` }}
          />
        </div>
        {/* Invisible range input layered over track for interaction */}
        <input
          type='range'
          min={0}
          max={1}
          step={0.001}
          value={progress || 0}
          onChange={(e) => seek(parseFloat(e.target.value))}
          className='absolute inset-0 w-full opacity-0 cursor-pointer'
        />
      </div>

      <span className='text-xs text-spotify-text w-8 tabular-nums'>{fmt(duration)}</span>
    </div>
  )
}
