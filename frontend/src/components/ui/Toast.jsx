import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store/useStore'

export default function Toast() {
  const toast = useStore((s) => s.toast)

  const colors = {
    info: 'bg-spotify-surface border-spotify-green',
    error: 'bg-red-900/80 border-red-500',
    success: 'bg-green-900/80 border-green-500',
  }

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key='toast'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg
            border text-white text-sm font-medium shadow-2xl ${colors[toast.type] || colors.info}`}
        >
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
