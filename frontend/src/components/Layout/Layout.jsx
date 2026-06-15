import { usePlayer } from '../../hooks/usePlayer'
import Sidebar from '../Sidebar/Sidebar'
import Player from '../Player/Player'
import MobileNav from '../MobileNav/MobileNav'
import AddPlaylistModal from '../AddPlaylistModal/AddPlaylistModal'
import DownloadQueue from '../DownloadQueue/DownloadQueue'
import Toast from '../ui/Toast'
import { useStore } from '../../store/useStore'

export default function Layout({ children }) {
  usePlayer()

  const showAddModal = useStore((s) => s.showAddModal)
  const downloads = useStore((s) => s.downloads)
  const activeDownloads = downloads.filter((d) => d.status === 'running')

  return (
    <div className='flex flex-col h-full bg-spotify-black overflow-hidden'>
      {/* Mac titlebar — invisible drag strip so user can move the window */}
      <div className='mac-drag fixed top-0 left-0 right-0 z-[60]' style={{ height: 'var(--titlebar-height)' }} />
      {/* Main area — leave room for player + mobile nav */}
      <div
        className='flex flex-1 overflow-hidden'
        style={{ paddingBottom: 'var(--player-height)' }}
      >
        {/* Sidebar — desktop only */}
        <aside
          className='hidden md:flex flex-col bg-spotify-darker shrink-0'
          style={{ width: 'var(--sidebar-width)' }}
        >
          <Sidebar />
        </aside>

        {/* Content */}
        <main className='flex-1 overflow-y-auto bg-spotify-black relative'>
          {children}
        </main>
      </div>

      {/* Fixed bottom player — above mobile nav on small screens */}
      <div
        className='fixed left-0 right-0 player-bar z-40'
        style={{
          bottom: 'calc(0px)',
          height: 'var(--player-height)',
        }}
      >
        <Player />
      </div>

      {/* Mobile bottom nav — sits above the player on mobile */}
      <MobileNav />

      {/* Download queue pill */}
      {activeDownloads.length > 0 && (
        <div className='fixed bottom-28 right-4 z-50'>
          <DownloadQueue />
        </div>
      )}

      {showAddModal && <AddPlaylistModal />}
      <Toast />
    </div>
  )
}
