import { useEffect, useRef } from 'react'
import audio from '../audio'

let _ctx = null
let _analyser = null
let _source = null

// Set up Web Audio API once — reuse across re-renders
function ensureAnalyser() {
  if (_analyser) return _analyser
  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)()
    _analyser = _ctx.createAnalyser()
    _analyser.fftSize = 64
    _analyser.smoothingTimeConstant = 0.8
    _source = _ctx.createMediaElementSource(audio)
    _source.connect(_analyser)
    _analyser.connect(_ctx.destination)
  } catch (_) {
    _analyser = null
  }
  return _analyser
}

export function useVisualizer(isPlaying) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  // Resume AudioContext on first play (browsers require user gesture)
  useEffect(() => {
    if (isPlaying && _ctx?.state === 'suspended') _ctx.resume()
    if (isPlaying) ensureAnalyser()
  }, [isPlaying])

  // Wire up on first interaction
  useEffect(() => {
    const setup = () => { ensureAnalyser(); audio.removeEventListener('play', setup) }
    audio.addEventListener('play', setup)
    return () => audio.removeEventListener('play', setup)
  }, [])

  // Draw loop — capped at 30fps to reduce CPU load
  useEffect(() => {
    let last = 0
    const draw = (ts) => {
      if (ts - last < 33) { animRef.current = requestAnimationFrame(draw); return }
      last = ts
      const canvas = canvasRef.current
      if (!canvas) { animRef.current = requestAnimationFrame(draw); return }

      const ctx = canvas.getContext('2d')
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)

      let values
      if (_analyser && isPlaying) {
        const data = new Uint8Array(_analyser.frequencyBinCount)
        _analyser.getByteFrequencyData(data)
        values = Array.from(data.slice(0, 28)).map(v => v / 255)
      } else {
        const t = Date.now() / 1000
        values = Array.from({ length: 28 }, (_, i) =>
          isPlaying
            ? 0.15 + 0.5 * Math.abs(Math.sin(t * (1.5 + i * 0.3) + i))
            : 0.04 + 0.06 * Math.abs(Math.sin(t * 0.7 + i * 0.5))
        )
      }

      const barW = W / values.length - 1.5
      values.forEach((v, i) => {
        const h = Math.max(2, v * H)
        const x = i * (barW + 1.5)
        const g = ctx.createLinearGradient(0, H, 0, H - h)
        g.addColorStop(0, '#1DB954')
        g.addColorStop(1, '#1ed76099')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.roundRect(x, H - h, barW, h, 2)
        ctx.fill()
      })

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [isPlaying])

  return canvasRef
}
