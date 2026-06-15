import { Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout/Layout'
import Home from './pages/Home'
import Library from './pages/Library'
import PlaylistView from './components/PlaylistView/PlaylistView'
import { api } from './api'
import { useStore } from './store/useStore'
import { checkForUpdate } from './services/updater'

export default function App() {
  const setPlaylists       = useStore((s) => s.setPlaylists)
  const setAvailableUpdate = useStore((s) => s.setAvailableUpdate)

  useEffect(() => {
    api.getPlaylists()
      .then(setPlaylists)
      .catch(() => {})

    // Check GitHub for a newer release on every startup
    checkForUpdate().then(update => {
      if (update) setAvailableUpdate(update)
    }).catch(() => {})
  }, [])

  return (
    <Layout>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/library' element={<Library />} />
        <Route path='/playlist/:id' element={<PlaylistView />} />
      </Routes>
    </Layout>
  )
}
