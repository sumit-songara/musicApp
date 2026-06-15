import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '../../api'
import { useStore } from '../../store/useStore'
import PlaylistHeader from './PlaylistHeader'
import TrackRow from './TrackRow'
import Spinner from '../ui/Spinner'

export default function PlaylistView() {
  const { id } = useParams()
  const [playlist, setPlaylist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const setActivePlaylist = useStore((s) => s.setActivePlaylist)
  const upsertPlaylist = useStore((s) => s.upsertPlaylist)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getPlaylist(id)
      .then((pl) => {
        setPlaylist(pl)
        setActivePlaylist(pl)
        upsertPlaylist(pl)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  // Poll while downloading
  useEffect(() => {
    if (!playlist || playlist.status !== 'downloading') return
    const timer = setInterval(() => {
      api.getPlaylist(id).then((pl) => {
        setPlaylist(pl)
        upsertPlaylist(pl)
      })
    }, 3000)
    return () => clearInterval(timer)
  }, [playlist?.status])

  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <Spinner size={40} />
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex items-center justify-center h-64 text-spotify-text'>
        Error: {error}
      </div>
    )
  }

  if (!playlist) return null

  const tracks = playlist.tracks || []

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className='min-h-full'
    >
      <PlaylistHeader playlist={playlist} />

      {/* Track list */}
      <div className='px-4 pb-24'>
        {/* Column headers */}
        <div className='flex items-center gap-4 px-4 py-2 border-b border-white/10 mb-2'>
          <span className='w-6 text-center text-xs text-spotify-text'>#</span>
          <span className='w-10 flex-shrink-0' />
          <span className='flex-1 text-xs text-spotify-text uppercase tracking-widest'>Title</span>
          <span className='w-10 text-right text-xs text-spotify-text uppercase tracking-widest'>Time</span>
          <span className='w-4' />
        </div>

        {tracks.length === 0 ? (
          <p className='text-center text-spotify-text py-12'>
            {playlist.status === 'downloading' ? 'Downloading tracks…' : 'No tracks found.'}
          </p>
        ) : (
          tracks.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} tracks={tracks} />
          ))
        )}
      </div>
    </motion.div>
  )
}
