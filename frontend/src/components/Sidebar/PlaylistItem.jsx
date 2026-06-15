import { NavLink } from 'react-router-dom'
import { useStore } from '../../store/useStore'

const SOURCE_ICON = { youtube: '▶', spotify: '●', local: '💾' }
const SOURCE_COLOR = { youtube: 'text-red-400', spotify: 'text-spotify-green', local: 'text-blue-400' }
const LIKED_SONGS_URL = '__liked_songs__'

export default function PlaylistItem({ playlist }) {
  const currentTrack = useStore((s) => s.currentTrack)
  const isActive = useStore((s) => s.activePlaylist?.id === playlist.id)

  return (
    <NavLink
      to={`/playlist/${playlist.id}`}
      className={({ isActive: routeActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer group transition-colors
         ${routeActive ? 'bg-spotify-surface-2' : 'hover:bg-spotify-surface'}`
      }
    >
      {/* Thumbnail or color block */}
      <div className={`w-10 h-10 rounded flex-shrink-0 overflow-hidden flex items-center justify-center
        ${playlist.url === LIKED_SONGS_URL
          ? 'bg-gradient-to-br from-purple-700 to-indigo-500'
          : 'bg-spotify-surface-2'}`}>
        {playlist.url === LIKED_SONGS_URL ? (
          <span className='text-lg text-white'>♥</span>
        ) : playlist.thumbnail ? (
          <img src={playlist.thumbnail} alt='' className='w-full h-full object-cover' />
        ) : (
          <span className={`text-lg ${SOURCE_COLOR[playlist.source] || 'text-white'}`}>
            {SOURCE_ICON[playlist.source] || '♫'}
          </span>
        )}
      </div>

      <div className='min-w-0 flex-1'>
        <p className='text-sm text-white font-medium truncate leading-tight'>{playlist.title}</p>
        <p className='text-xs text-spotify-text mt-0.5 truncate'>
          <span className={SOURCE_COLOR[playlist.source]}>{playlist.source}</span>
          {playlist.status === 'downloading' && (
            <span className='ml-1 text-yellow-400 animate-pulse'>• downloading</span>
          )}
          {playlist.downloaded_count > 0 && (
            <span className='ml-1'>• {playlist.downloaded_count} tracks</span>
          )}
        </p>
      </div>
    </NavLink>
  )
}
