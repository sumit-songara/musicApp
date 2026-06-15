import { NavLink } from 'react-router-dom'
import { useStore } from '../../store/useStore'

const HomeIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
  </svg>
)

const LibraryIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
  </svg>
)

export default function MobileNav() {
  const setShowAddModal = useStore((s) => s.setShowAddModal)

  return (
    <nav className='md:hidden fixed bottom-0 left-0 right-0 z-30 player-bar'
         style={{ height: '56px', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className='flex h-14'>
        <NavLink to='/' end className={({ isActive }) =>
          `flex-1 flex flex-col items-center justify-center gap-1 text-xs transition-colors
           ${isActive ? 'text-spotify-green' : 'text-spotify-text'}`}>
          <HomeIcon />
          <span className='font-medium'>Home</span>
        </NavLink>

        <NavLink to='/library' className={({ isActive }) =>
          `flex-1 flex flex-col items-center justify-center gap-1 text-xs transition-colors
           ${isActive ? 'text-spotify-green' : 'text-spotify-text'}`}>
          <LibraryIcon />
          <span className='font-medium'>Library</span>
        </NavLink>

        <button
          onClick={() => setShowAddModal(true)}
          className='flex-1 flex flex-col items-center justify-center gap-1 text-xs text-spotify-text'>
          <span className='w-8 h-8 rounded-full bg-spotify-green flex items-center justify-center'>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="black">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </span>
        </button>
      </div>
    </nav>
  )
}
