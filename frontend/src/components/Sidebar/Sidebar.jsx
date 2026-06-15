import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useStore } from '../../store/useStore'
import PlaylistItem from './PlaylistItem'
import MobileAccess from '../MobileAccess/MobileAccess'
import { openDownload } from '../../services/updater'

const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
  </svg>
)

const LibraryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
  </svg>
)

const NavItem = ({ to, icon, label }) => (
  <NavLink
    to={to}
    end={to === '/'}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150
       ${isActive
         ? 'bg-white/10 text-white'
         : 'text-spotify-text hover:text-white hover:bg-white/5'}`
    }
  >
    {icon}
    {label}
  </NavLink>
)

export default function Sidebar() {
  const playlists        = useStore((s) => s.playlists)
  const setShowAddModal  = useStore((s) => s.setShowAddModal)
  const availableUpdate  = useStore((s) => s.availableUpdate)
  const [showMobile, setShowMobile] = useState(false)

  return (
    <>
      <div className='flex flex-col h-full overflow-hidden'>
        {/* Traffic light clearance on Mac — matches --titlebar-height */}
        <div className='mac-no-drag flex-shrink-0' style={{ height: 'var(--titlebar-height)' }} />

        {/* Logo */}
        <div className='px-6 py-4 mac-no-drag'>
          <div className='flex items-center gap-2.5'>
            <div className='w-8 h-8 rounded-full bg-spotify-green flex items-center justify-center shadow-lg shadow-spotify-green/30'>
              <span className='text-black text-sm font-black'>♫</span>
            </div>
            <span className='text-white font-black text-lg tracking-tight'>OfflineBeats</span>
          </div>
        </div>

        {/* Nav */}
        <nav className='px-2 space-y-0.5 mac-no-drag'>
          <NavItem to='/' icon={<HomeIcon />} label='Home' />
          <NavItem to='/library' icon={<LibraryIcon />} label='Your Library' />
        </nav>

        <hr className='my-3 border-white/10 mx-4' />

        {/* Playlists header */}
        <div className='flex items-center justify-between px-4 py-1.5'>
          <span className='text-xs font-bold text-spotify-text uppercase tracking-widest'>Playlists</span>
          <button
            onClick={() => setShowAddModal(true)}
            className='mac-no-drag w-7 h-7 rounded-full flex items-center justify-center
                       text-spotify-text hover:text-white hover:bg-white/10 transition-all text-lg leading-none'
            title='Add playlist'
          >
            +
          </button>
        </div>

        {/* Playlist list */}
        <div className='flex-1 overflow-y-auto px-2 space-y-0.5 pb-2 mac-no-drag'>
          {playlists.length === 0 ? (
            <p className='px-4 py-6 text-xs text-spotify-muted text-center leading-relaxed'>
              No playlists yet.<br />Click + to add music.
            </p>
          ) : (
            playlists.map((pl) => (
              <motion.div key={pl.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                <PlaylistItem playlist={pl} />
              </motion.div>
            ))
          )}
        </div>

        {/* Update banner — only shows when a new GitHub release is available */}
        {availableUpdate && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => openDownload(availableUpdate.downloadUrl)}
            className='mac-no-drag mx-3 mb-2 flex items-center gap-2.5 px-4 py-2.5 rounded-xl
                       bg-spotify-green/15 border border-spotify-green/40 hover:bg-spotify-green/25
                       transition-colors group text-left w-[calc(100%-24px)]'
            title={availableUpdate.notes || 'Click to download the update'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
                 className="text-spotify-green flex-shrink-0">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z"/>
            </svg>
            <div>
              <p className='text-xs font-bold text-spotify-green leading-tight'>
                Update {availableUpdate.version} ready
              </p>
              <p className='text-xs text-spotify-muted leading-tight'>Click to download</p>
            </div>
          </motion.button>
        )}

        {/* Mobile access */}
        <button
          onClick={() => setShowMobile(true)}
          className='mac-no-drag mx-3 mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl
                     bg-spotify-green/10 border border-spotify-green/20 hover:bg-spotify-green/20
                     transition-colors group'
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-spotify-green flex-shrink-0">
            <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
          </svg>
          <div className='text-left'>
            <p className='text-xs font-bold text-spotify-green'>Open on Mobile</p>
            <p className='text-xs text-spotify-muted'>Scan QR to connect</p>
          </div>
        </button>
      </div>

      {showMobile && <MobileAccess onClose={() => setShowMobile(false)} />}
    </>
  )
}
