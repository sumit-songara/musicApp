import { create } from 'zustand'
import audio from '../audio'

export const useStore = create((set, get) => ({
  // ── Playlists ──────────────────────────────────────────────────────────────
  playlists: [],
  setPlaylists: (playlists) => set({ playlists }),
  upsertPlaylist: (pl) =>
    set((s) => {
      const idx = s.playlists.findIndex((p) => p.id === pl.id)
      if (idx === -1) return { playlists: [pl, ...s.playlists] }
      const next = [...s.playlists]
      next[idx] = { ...next[idx], ...pl }
      return { playlists: next }
    }),
  removePlaylist: (id) =>
    set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),

  // ── Active playlist / track list ──────────────────────────────────────────
  activePlaylist: null,
  setActivePlaylist: (pl) => set({ activePlaylist: pl }),

  // ── Player ────────────────────────────────────────────────────────────────
  currentTrack: null,
  queue: [],        // ordered list of track objects
  queueIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: 'off',   // 'off' | 'one' | 'all'
  volume: 0.8,
  progress: 0,     // 0-1
  duration: 0,

  setCurrentTrack: (track) => set({ currentTrack: track }),
  setQueue: (queue, index = 0) => set({ queue, queueIndex: index }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    })),
  setVolume: (v) => set({ volume: v }),
  setProgress: (v) => set({ progress: v }),
  setDuration: (v) => set({ duration: v }),

  playTrack: (track, playlist) => {
    const tracks = playlist?.tracks || get().queue
    const index = tracks.findIndex((t) => t.id === track.id)
    set({
      currentTrack: track,
      queue: tracks,
      queueIndex: index,
      isPlaying: true,
    })
  },

  playNext: () => {
    const { queue, queueIndex, shuffle, repeat } = get()
    if (!queue.length) return
    let next
    if (shuffle) {
      next = Math.floor(Math.random() * queue.length)
    } else if (repeat === 'one') {
      next = queueIndex
    } else {
      next = queueIndex + 1
      if (next >= queue.length) {
        if (repeat === 'all') next = 0
        else { set({ isPlaying: false }); return }
      }
    }
    set({ currentTrack: queue[next], queueIndex: next, isPlaying: true })
  },

  playPrev: () => {
    const { queue, queueIndex, progress } = get()
    if (!queue.length) return
    if (progress > 0.05) {
      // Restart current track — seek the real audio element, not just the UI bar
      audio.currentTime = 0
      set({ progress: 0 })
      return
    }
    const prev = Math.max(0, queueIndex - 1)
    set({ currentTrack: queue[prev], queueIndex: prev, isPlaying: true })
  },

  // ── Downloads ─────────────────────────────────────────────────────────────
  downloads: [],  // [{id, playlist_id, track, percent, status}]
  eventSources: {},  // download_id -> EventSource
  addDownload: (dl) => set((s) => ({ downloads: [dl, ...s.downloads] })),
  updateDownload: (id, patch) =>
    set((s) => ({
      downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  removeDownload: (id) =>
    set((s) => ({ downloads: s.downloads.filter((d) => d.id !== id) })),
  registerEventSource: (download_id, es) =>
    set((s) => ({ eventSources: { ...s.eventSources, [download_id]: es } })),
  unregisterEventSource: (download_id) =>
    set((s) => {
      const next = { ...s.eventSources }
      delete next[download_id]
      return { eventSources: next }
    }),

  // ── UI ────────────────────────────────────────────────────────────────────
  showAddModal: false,
  setShowAddModal: (v) => set({ showAddModal: v }),
  toast: null,
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 3500)
  },

  // ── Update ────────────────────────────────────────────────────────────────
  // Set by App.jsx on startup when a newer GitHub release is found.
  // { version: 'v2.2.0', notes: '...', downloadUrl: 'https://...' } | null
  availableUpdate: null,
  setAvailableUpdate: (info) => set({ availableUpdate: info }),
}))
