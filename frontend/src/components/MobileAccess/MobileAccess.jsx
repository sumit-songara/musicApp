import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'
import { api } from '../../api'

export default function MobileAccess({ onClose }) {
  const canvasRef = useRef(null)
  const [info, setInfo] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.getNetworkInfo().then(data => {
      setInfo(data)
      QRCode.toCanvas(canvasRef.current, data.url, {
        width: 200,
        margin: 2,
        color: { dark: '#ffffff', light: '#181818' },
      })
    }).catch(() => setInfo({ url: window.location.origin, ip: 'unknown', port: 7777 }))
  }, [])

  const copy = () => {
    navigator.clipboard.writeText(info?.url || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatePresence>
      <motion.div
        key='overlay'
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className='fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4'
      >
        <motion.div
          key='sheet'
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className='bg-spotify-elevated rounded-2xl p-6 w-full max-w-sm shadow-2xl'
        >
          <div className='flex items-center justify-between mb-5'>
            <h2 className='text-xl font-black text-white'>Open on Mobile</h2>
            <button onClick={onClose} className='text-spotify-muted hover:text-white text-2xl leading-none'>×</button>
          </div>

          {/* QR Code */}
          <div className='flex justify-center mb-5'>
            <div className='bg-spotify-surface rounded-xl p-3'>
              <canvas ref={canvasRef} className='rounded-lg' />
            </div>
          </div>

          {/* Steps */}
          <div className='space-y-3 mb-5'>
            {[
              { icon: '📶', text: 'Make sure your phone is on the same WiFi' },
              { icon: '📷', text: 'Scan the QR code with your camera' },
              { icon: '📲', text: 'Tap "Add to Home Screen" to install the app' },
            ].map(({ icon, text }) => (
              <div key={text} className='flex items-start gap-3 text-sm text-spotify-text'>
                <span className='text-base mt-0.5'>{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* URL */}
          <div className='flex items-center gap-2 bg-spotify-black rounded-lg px-3 py-2.5'>
            <span className='text-xs text-spotify-text font-mono flex-1 truncate'>
              {info?.url || '…'}
            </span>
            <button
              onClick={copy}
              className='text-xs font-bold text-spotify-green hover:text-spotify-green-bright flex-shrink-0'
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          {/* iOS tip */}
          <p className='text-xs text-spotify-muted text-center mt-4 leading-relaxed'>
            <strong className='text-white'>iOS:</strong> Safari → Share → Add to Home Screen<br />
            <strong className='text-white'>Android:</strong> Chrome → ⋮ → Add to Home Screen
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
