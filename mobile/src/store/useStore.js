import { create } from 'zustand'
import { downloadTrack }                                      from '../services/downloader'
import { saveTrack, getPlaylistWithTracks, getPlaylists }     from '../services/db'
import { postDownloadNotif, postDoneNotif, clearDownloadNotif } from '../services/notifications'

// Module-level — survives component unmount and navigation (unlike React refs/state)
const _resumableRef = { current: null }
let   _cancelFlag   = false
let   _dlFloor      = 0

const DL_INIT = {
  active:     false,
  playlistId: null,
  trackId:    null,
  idx:        0,
  total:      0,
  title:      '',
  prog:       0,      // 0–1 float
  written:    0,
  totalBytes: 0,
  failed:     [],     // [{ title, error }] — available after download ends
}

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
  removePlaylist: (id) => set(s => {
    const update = { playlists: s.playlists.filter(p => p.id !== id) }
    if (s.currentTrack?.playlist_id === id) {
      update.currentTrack = null
      update.queue        = []
      update.queueIndex   = -1
      update.isPlaying    = false
    }
    return update
  }),

  // ── Player ─────────────────────────────────────────────────────────────────
  currentTrack:    null,
  queue:           [],
  queueIndex:      -1,
  isPlaying:       false,
  position:        0,
  duration:        0,
  shuffle:         false,
  repeat:          'off',
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

  // ── Background download ────────────────────────────────────────────────────
  dl:        { ...DL_INIT },
  dlRevision: 0,   // bumped on every DB write so screens know to silently refresh

  startDownload: async (playlist) => {
    if (get().dl.active) return
    const pending = (playlist.tracks || []).filter(t => !t.is_downloaded)
    if (!pending.length) return

    _cancelFlag = false
    set({ dl: { ...DL_INIT, active: true, playlistId: playlist.id, total: pending.length } })

    const failed = []

    for (let i = 0; i < pending.length; i++) {
      if (_cancelFlag) break
      const track = pending[i]
      _dlFloor = 0
      set(s => ({
        dl: { ...s.dl, trackId: track.id, idx: i + 1, title: track.title, prog: 0, written: 0, totalBytes: 0 },
      }))

      await postDownloadNotif({ title: track.title, current: i + 1, total: pending.length, pct: 0 })

      try {
        const result = await downloadTrack(
          track,
          playlist.id,
          ({ pct, writtenBytes, totalBytes }) => {
            const safe = Math.max(pct, _dlFloor)
            _dlFloor = safe
            set(s => ({ dl: { ...s.dl, prog: safe, written: writtenBytes || 0, totalBytes: totalBytes || 0 } }))
          },
          _resumableRef,
          async ({ title: t, artist: a, thumbnail: th, duration: d }) => {
            try {
              await saveTrack({
                id: track.id, playlist_id: playlist.id,
                title: t, artist: a, thumbnail: th, duration: d,
                file_path: track.file_path || '', is_downloaded: false,
                position: track.position ?? i,
              })
              set(s => ({ dlRevision: s.dlRevision + 1 }))
            } catch {}
          },
        )
        await saveTrack({ ...result, id: track.id, playlist_id: playlist.id, is_downloaded: true, position: track.position ?? i })
        set(s => ({ dlRevision: s.dlRevision + 1 }))

        const fresh = await getPlaylistWithTracks(playlist.id)
        if (fresh) {
          const dlCount = (fresh.tracks || []).filter(t => t.is_downloaded).length
          get().upsertPlaylist({ ...fresh, downloaded_count: dlCount })
        }
      } catch (e) {
        console.warn('[DL]', track.title, e?.message)
        failed.push({ title: track.title, error: e?.message || 'Unknown error' })
      }
    }

    // Keep playlistId + failed so the screen can show the "X tracks failed" alert
    set({ dl: { ...DL_INIT, playlistId: playlist.id, failed } })
    await clearDownloadNotif()

    if (!_cancelFlag) {
      const final = await getPlaylistWithTracks(playlist.id)
      if (final) {
        const dlCount = (final.tracks || []).filter(t => t.is_downloaded).length
        if (dlCount > 0) await postDoneNotif(dlCount)
        get().upsertPlaylist({ ...final, downloaded_count: dlCount })
      }
      const all = await getPlaylists()
      get().setPlaylists(all || [])
      set(s => ({ dlRevision: s.dlRevision + 1 }))
    }
  },

  cancelDownload: async () => {
    _cancelFlag = true
    if (_resumableRef.current) {
      try { await _resumableRef.current.cancelAsync() } catch {}
      _resumableRef.current = null
    }
    set({ dl: { ...DL_INIT } })
    await clearDownloadNotif()
  },
}))
