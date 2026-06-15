import TrackPlayer, { Event } from 'react-native-track-player'
import { useStore } from '../store/useStore'

export async function PlaybackService() {
  // Remote play/pause — sync state back to the store so the in-app UI stays in sync
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play()
    useStore.setState({ isPlaying: true })
  })

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause()
    useStore.setState({ isPlaying: false })
  })

  // Lock-screen Next — skip directly in RNTP so the button works from the lock
  // screen even when the app's React component tree isn't active. PlaybackActiveTrackChanged
  // will fire and sync the Zustand store via useAudioEngine.
  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    const { queue, queueIndex, shuffle, repeat } = useStore.getState()
    try {
      if (shuffle) {
        const next = Math.floor(Math.random() * (queue.length || 1))
        await TrackPlayer.skip(next)
      } else {
        await TrackPlayer.skipToNext()
      }
      useStore.setState({ isPlaying: true })
    } catch {
      // End of queue — let store handle repeat logic
      useStore.getState().playNext()
    }
  })

  // Lock-screen Previous — seek to 0 if past 3 s, otherwise skip back
  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      const { position } = await TrackPlayer.getProgress()
      if (position > 3) {
        await TrackPlayer.seekTo(0)
      } else {
        await TrackPlayer.skipToPrevious()
      }
      useStore.setState({ isPlaying: true })
    } catch {
      useStore.getState().playPrev()
    }
  })

  // Seek from lock screen / notification
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    TrackPlayer.seekTo(position)
    useStore.getState().setPosition(Math.floor(position))
  })

  // Audio focus lost (phone call etc.) — pause and keep the notification
  TrackPlayer.addEventListener(Event.RemoteDuck, ({ paused }) => {
    if (paused) {
      TrackPlayer.pause()
      useStore.setState({ isPlaying: false })
    } else {
      TrackPlayer.play()
      useStore.setState({ isPlaying: true })
    }
  })
}
