import { useEffect, useRef } from 'react'
import audio from '../audio'
import { useStore } from '../store/useStore'
import { api } from '../api'

export function usePlayer() {
  const { currentTrack, isPlaying, volume, setIsPlaying, setProgress, setDuration, playNext } = useStore()
  // Track which ID is currently loaded to avoid URL string comparison issues
  // (audio.src is absolute but api.audioUrl may be relative in production)
  const loadedTrackId = useRef(null)

  // Wire up audio events once
  useEffect(() => {
    const onTime    = () => audio.duration && setProgress(audio.currentTime / audio.duration)
    const onMeta    = () => setDuration(audio.duration || 0)
    const onEnded   = () => playNext()
    const onError   = () => setIsPlaying(false)

    audio.addEventListener('timeupdate',     onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended',          onEnded)
    audio.addEventListener('error',          onError)

    return () => {
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended',          onEnded)
      audio.removeEventListener('error',          onError)
    }
  }, [])

  // Single effect for both track switching and play/pause — avoids the race
  // where two separate effects both call audio.play() in the same render cycle,
  // causing the first play() promise to abort and setIsPlaying(false) to fire.
  useEffect(() => {
    if (!currentTrack) return
    if (loadedTrackId.current !== currentTrack.id) {
      loadedTrackId.current = currentTrack.id
      audio.pause()
      audio.src = api.audioUrl(currentTrack.id)
      audio.load()
    }
    if (isPlaying) {
      audio.play().catch((e) => {
        // AbortError is expected when load/pause interrupts a pending play —
        // don't treat it as a failure that resets the playing state.
        if (e.name !== 'AbortError') setIsPlaying(false)
      })
    } else {
      audio.pause()
    }
  }, [currentTrack, isPlaying])

  // Volume
  useEffect(() => { audio.volume = volume }, [volume])

  function seek(ratio) {
    if (audio.duration) {
      audio.currentTime = ratio * audio.duration
      setProgress(ratio)
    }
  }

  // Expose audio element so visualizer can tap it
  return { seek, audio }
}
