import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // ── Playlists ──────────────────────────────────────────────────────────────
  playlists: [],
  setPlaylists:   (list) => set({ playlists: list }),
  upsertPlaylist: (pl)   => set(s => {
    const idx = s.playlists.findIndex(p => p.id === pl.id)
    if (idx === -1) return { playlists: [pl, ...s.playlists] }
    const next = [...s.playlists]
    next[idx] = { ...next[idx], ...pl }
    return { playlists: next }
  }),
  removePlaylist: (id) => set(s => ({ playlists: s.playlists.filter(p => p.id !== id) })),

  // ── Player ─────────────────────────────────────────────────────────────────
  currentTrack:    null,
  queue:           [],
  queueIndex:      -1,
  isPlaying:       false,
  position:        0,
  duration:        0,
  shuffle:         false,
  repeat:          'off',   // 'off' | 'all' | 'one'
  fullPlayerOpen:  false,

  setCurrentTrack:   (t) => set({ currentTrack: t }),
  setIsPlaying:      (v) => set({ isPlaying: v }),
  setPosition:       (v) => set({ position: v }),
  setDuration:       (v) => set({ duration: v }),
  setFullPlayerOpen: (v) => set({ fullPlayerOpen: v }),
  toggleShuffle:     ()  => set(s => ({ shuffle: !s.shuffle })),
  cycleRepeat:       ()  => set(s => ({
    repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
  })),

  playTrack: (track, allTracks) => {
    const idx = (allTracks || []).findIndex(t => t.id === track.id)
    set({ currentTrack: track, queue: allTracks || [], queueIndex: idx < 0 ? 0 : idx, isPlaying: true })
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
      if (next >= queue.length) next = 0
    }
    set({ currentTrack: queue[next], queueIndex: next, isPlaying: true })
  },

  playPrev: () => {
    const { queue, queueIndex } = get()
    if (!queue.length) return
    const prev = Math.max(0, queueIndex - 1)
    set({ currentTrack: queue[prev], queueIndex: prev, isPlaying: true })
  },
}))
