import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store/useStore'
import Spinner from '../ui/Spinner'

export default function DownloadQueue() {
  const downloads = useStore((s) => s.downloads)
  const removeDownload = useStore((s) => s.removeDownload)
  const active = downloads.filter((d) => d.status === 'running')

  return (
    <AnimatePresence>
      {active.map((dl) => (
        <motion.div
          key={dl.id}
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className='bg-spotify-elevated border border-white/10 rounded-xl p-3
                     shadow-2xl mb-2 w-72'
        >
          <div className='flex items-center gap-3'>
            <Spinner size={18} />
            <div className='flex-1 min-w-0'>
              <p className='text-xs text-white font-medium truncate'>{dl.track}</p>
              <div className='mt-1 h-1 rounded-full bg-white/10 overflow-hidden'>
                <motion.div
                  className='h-full bg-spotify-green rounded-full'
                  initial={{ width: '0%' }}
                  animate={{ width: dl.percent || '0%' }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>
            <button
              onClick={() => removeDownload(dl.id)}
              className='text-spotify-muted hover:text-white text-xs flex-shrink-0'
            >
              ✕
            </button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
