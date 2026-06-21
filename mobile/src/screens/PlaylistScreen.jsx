import { useEffect, useState, useCallback, useRef, memo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Image, StyleSheet,
  Alert, ActivityIndicator, Platform, StatusBar,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import * as FileSystem from 'expo-file-system'
import { useStore } from '../store/useStore'
import { getPlaylistWithTracks, saveTrack, getPlaylists, deletePlaylistFromDb } from '../services/db'
import { downloadTrack } from '../services/downloader'
import { postDownloadNotif, postDoneNotif, clearDownloadNotif } from '../services/notifications'
import { C, R, S, TAB_BAR_H, PLAYER_H } from '../theme'

function fmt(secs) {
  if (!secs) return '--:--'
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`
}

function fmtMB(bytes) {
  if (!bytes || bytes <= 0) return null
  const mb = bytes / (1024 * 1024)
  return mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`
}

const SRC_COLOR = { youtube: '#ff5555', spotify: C.green }
const SRC_LABEL = { youtube: 'YouTube Playlist', spotify: 'Spotify Playlist' }
const TRACK_H   = 60

// ── Animated now-playing bars ─────────────────────────────────────────────────
import { Animated } from 'react-native'
function NowPlayingBars() {
  const a1 = useRef(new Animated.Value(0)).current
  const a2 = useRef(new Animated.Value(0)).current
  const a3 = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const make = (a, d) => Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 550, delay: d, useNativeDriver: false }),
      Animated.timing(a, { toValue: 0, duration: 550, useNativeDriver: false }),
    ]))
    const l1 = make(a1, 0); const l2 = make(a2, 220); const l3 = make(a3, 440)
    l1.start(); l2.start(); l3.start()
    return () => { l1.stop(); l2.stop(); l3.stop() }
  }, [])
  const bar = a => ({ width: 3, borderRadius: 2, backgroundColor: C.green, marginHorizontal: 1, height: a.interpolate({ inputRange: [0, 1], outputRange: [4, 14] }) })
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 14, width: 16 }}>
      <Animated.View style={bar(a1)} />
      <Animated.View style={bar(a2)} />
      <Animated.View style={bar(a3)} />
    </View>
  )
}

// ── Track row — matches web TrackRow design exactly ───────────────────────────
const TrackRow = memo(function TrackRow({ track, index, isActive, isPlaying, isDownloading, dlProgress, onPress }) {
  return (
    <TouchableOpacity
      style={[tr.row, isActive && tr.rowActive, !track.is_downloaded && !isDownloading && tr.rowDim]}
      onPress={onPress}
      activeOpacity={track.is_downloaded ? 0.7 : 1}
    >
      {/* # / bars */}
      <View style={tr.num}>
        {isActive && isPlaying
          ? <NowPlayingBars />
          : <Text style={[tr.numText, isActive && { color: C.green }]}>{index + 1}</Text>
        }
      </View>

      {/* Thumbnail */}
      <View style={tr.thumb}>
        {track.thumbnail
          ? <Image source={{ uri: track.thumbnail }} style={tr.thumbImg} resizeMode='cover' />
          : <View style={[tr.thumbImg, tr.thumbFallback]}><Text style={{ fontSize: 12, color: C.muted }}>♫</Text></View>
        }
      </View>

      {/* Title + artist + download bar */}
      <View style={tr.info}>
        <Text style={[tr.title, isActive && { color: C.green }]} numberOfLines={1}>{track.title}</Text>
        <Text style={tr.artist} numberOfLines={1}>{track.artist}</Text>
        {isDownloading && (
          <View style={tr.dlBar}>
            <View style={[tr.dlBarFill, { width: `${Math.round((dlProgress || 0) * 100)}%` }]} />
          </View>
        )}
      </View>

      {/* Duration / spinner */}
      <View style={tr.right}>
        {isDownloading
          ? <ActivityIndicator size='small' color={C.green} />
          : <Text style={tr.dur}>{track.is_downloaded ? fmt(track.duration) : '↓'}</Text>
        }
      </View>
    </TouchableOpacity>
  )
})

// ── Main screen ───────────────────────────────────────────────────────────────
export default function PlaylistScreen() {
  const { params }   = useRoute()
  const navigation   = useNavigation()
  const [playlist, setPlaylist]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [loadErr, setLoadErr]         = useState(null)
  const [dlId, setDlId]               = useState(null)
  const [dlProg, setDlProg]           = useState(0)
  const [dlWritten, setDlWritten]     = useState(0)
  const [dlTotalBytes, setDlTotalBytes] = useState(0)
  const [dlIdx, setDlIdx]             = useState(0)
  const [dlTotal, setDlTotal]         = useState(0)
  const [dlTitle, setDlTitle]         = useState('')
  const [downloading, setDownloading] = useState(false)
  const cancelRef    = useRef(false)
  const resumeRef    = useRef(null)
  const dlProgFloor  = useRef(0)   // high-water mark — progress never goes backward within a track

  const { playTrack, currentTrack, isPlaying, setIsPlaying, setPlaylists, upsertPlaylist } = useStore()

  // ── Load playlist — bulletproof null handling ─────────────────────────────
  const load = useCallback(async () => {
    if (!params?.id) { setLoadErr('No playlist ID'); setLoading(false); return }
    try {
      setLoading(true); setLoadErr(null)
      const pl = await getPlaylistWithTracks(params.id)
      if (!pl) { setLoadErr('Playlist not found'); setLoading(false); return }
      setPlaylist({ ...pl, tracks: pl.tracks || [] })
    } catch (e) {
      setLoadErr(e?.message || 'Failed to load playlist')
    } finally {
      setLoading(false)
    }
  }, [params?.id])

  useEffect(() => { load() }, [load])

  // ── Download all pending tracks ────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!playlist) return
    const pending = (playlist.tracks || []).filter(t => !t.is_downloaded)
    if (!pending.length) { Alert.alert('All done', 'Every track is already downloaded.'); return }

    // Confirm for large playlists
    if (pending.length > 4) {
      const confirmed = await new Promise(resolve =>
        Alert.alert(
          'Download Playlist',
          `Save ${pending.length} tracks to your phone?\n\nDownloads will continue even if you switch apps.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: `Download ${pending.length} tracks`, onPress: () => resolve(true) },
          ]
        )
      )
      if (!confirmed) return
    }

    cancelRef.current = false
    setDownloading(true)
    setDlTotal(pending.length)
    const failed = []   // { title, error }

    for (let i = 0; i < pending.length; i++) {
      if (cancelRef.current) break
      const track = pending[i]
      dlProgFloor.current = 0
      setDlId(track.id); setDlIdx(i + 1); setDlTitle(track.title); setDlProg(0); setDlWritten(0); setDlTotalBytes(0)

      // One notification per song — no mid-song updates to avoid notification spam
      await postDownloadNotif({ title: track.title, current: i + 1, total: pending.length, pct: 0 })

      try {
        const result = await downloadTrack(
          track,
          playlist.id,
          ({ pct, writtenBytes, totalBytes }) => {
            // Clamp to high-water mark so retried downloads (pct resets to 0) never go backward
            const safe = Math.max(pct, dlProgFloor.current)
            dlProgFloor.current = safe
            setDlProg(safe)
            setDlWritten(writtenBytes || 0)
            setDlTotalBytes(totalBytes || 0)
          },
          resumeRef,
          // onMetaResolved: fires as soon as YouTube videoId+thumbnail are known,
          // before the file download finishes — persists thumbnail early so it
          // shows up even if the download later fails.
          async ({ title: resolvedTitle, artist: resolvedArtist, thumbnail: resolvedThumb, duration: resolvedDur }) => {
            try {
              await saveTrack({
                id: track.id,
                playlist_id: playlist.id,
                title:       resolvedTitle,
                artist:      resolvedArtist,
                thumbnail:   resolvedThumb,
                duration:    resolvedDur,
                file_path:   track.file_path || '',
                is_downloaded: false,
                position:    track.position ?? i,
              })
              // Update local state so thumbnail appears immediately in the list
              setPlaylist(prev => {
                if (!prev) return prev
                return {
                  ...prev,
                  tracks: prev.tracks.map(t =>
                    t.id === track.id
                      ? { ...t, title: resolvedTitle, artist: resolvedArtist, thumbnail: resolvedThumb, duration: resolvedDur }
                      : t
                  ),
                }
              })
            } catch {}
          },
        )
        await saveTrack({ ...result, id: track.id, playlist_id: playlist.id, is_downloaded: true, position: track.position ?? i })
        const fresh = await getPlaylistWithTracks(params.id)
        if (fresh) {
          const freshPl = { ...fresh, tracks: fresh.tracks || [] }
          setPlaylist(freshPl)
          const dlCount = (fresh.tracks || []).filter(t => t.is_downloaded).length
          upsertPlaylist({ ...freshPl, downloaded_count: dlCount })
        }
      } catch (e) {
        console.warn('[DL]', track.title, e?.message)
        failed.push({ title: track.title, error: e?.message || 'Unknown error' })
      }
    }

    setDlId(null); setDlTitle(''); setDownloading(false)
    await clearDownloadNotif()

    if (!cancelRef.current) {
      const final = await getPlaylistWithTracks(params.id)
      if (final) {
        const dlCount = (final.tracks || []).filter(t => t.is_downloaded).length
        if (dlCount > 0) await postDoneNotif(dlCount)
        setPlaylist({ ...final, tracks: final.tracks || [] })
        upsertPlaylist({ ...final, downloaded_count: dlCount })
      }

      if (failed.length > 0) {
        const lines = failed.slice(0, 4).map(f => `• ${f.title}\n  (${f.error})`).join('\n')
        const more  = failed.length > 4 ? `\n…and ${failed.length - 4} more` : ''
        Alert.alert(
          `${failed.length} track${failed.length > 1 ? 's' : ''} failed`,
          `${lines}${more}\n\nTry again on Wi-Fi or tap Download to retry.`,
          [{ text: 'OK' }]
        )
      }
    }

    const all = await getPlaylists()
    setPlaylists(all || [])
  }, [playlist, params?.id, upsertPlaylist, setPlaylists])

  const handleCancel = useCallback(async () => {
    cancelRef.current = true
    if (resumeRef.current) { try { await resumeRef.current.cancelAsync() } catch {}; resumeRef.current = null }
    await clearDownloadNotif()
    setDownloading(false); setDlId(null); setDlTitle('')
  }, [])

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Playlist', 'Remove this playlist and all downloaded files?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await handleCancel()
          const filePaths = await deletePlaylistFromDb(playlist.id)
          for (const p of filePaths) {
            await FileSystem.deleteAsync(p, { idempotent: true }).catch(() => {})
          }
          useStore.getState().removePlaylist(playlist.id)
          navigation.goBack()
        },
      },
    ])
  }, [playlist, handleCancel, navigation])

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size='large' color={C.green} />
    </View>
  )

  if (loadErr || !playlist) return (
    <View style={s.center}>
      <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>{loadErr || 'Playlist not found'}</Text>
      <TouchableOpacity onPress={load} style={s.retryBtn}>
        <Text style={{ color: C.green, fontSize: 14, fontWeight: '700' }}>Retry</Text>
      </TouchableOpacity>
    </View>
  )

  const tracks     = playlist.tracks || []
  const downloaded = tracks.filter(t => t.is_downloaded).length
  const total      = tracks.length
  const pending    = total - downloaded
  const pct        = total > 0 ? downloaded / total : 0
  const accentColor= SRC_COLOR[playlist.source] || C.green

  return (
    <View style={s.root}>
      <StatusBar barStyle='light-content' backgroundColor='transparent' translucent />

      <FlatList
        data={tracks}
        keyExtractor={t => String(t.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_H + PLAYER_H + 16 }}
        getItemLayout={(_, idx) => ({ length: TRACK_H, offset: TRACK_H * idx, index: idx })}
        initialNumToRender={14}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}

        ListHeaderComponent={
          <>
            {/* Gradient header — matches web PlaylistHeader */}
            <LinearGradient
              colors={[`${accentColor}33`, '#12121200']}
              style={[s.header, { paddingTop: 72 }]}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            >
              <View style={s.headerInner}>
                {/* Album art */}
                <View style={[s.art, { shadowColor: accentColor }]}>
                  {playlist.thumbnail
                    ? <Image source={{ uri: playlist.thumbnail }} style={s.artImg} resizeMode='cover' />
                    : <View style={s.artFallback}><Text style={{ fontSize: 56 }}>🎵</Text></View>
                  }
                </View>

                {/* Info */}
                <View style={s.meta}>
                  <Text style={s.sourceLabel}>{SRC_LABEL[playlist.source] || 'Playlist'}</Text>
                  <Text style={s.plTitle} numberOfLines={3}>{playlist.title}</Text>
                  <Text style={s.dlCount}>
                    {downloaded} / {total} tracks downloaded
                    {downloading && <Text style={s.dlPulse}> · downloading…</Text>}
                  </Text>

                  {/* Buttons: play + download/stop + delete */}
                  <View style={s.btns}>
                    {/* Big green play button (matches web) */}
                    <TouchableOpacity
                      style={[s.playBtn, downloaded === 0 && s.btnOff]}
                      disabled={downloaded === 0}
                      onPress={() => {
                        const ready = tracks.filter(t => t.is_downloaded)
                        if (ready.length) playTrack(ready[0], ready)
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={s.playBtnIcon}>▶</Text>
                    </TouchableOpacity>

                    {downloading ? (
                      <TouchableOpacity style={s.stopBtn} onPress={handleCancel} activeOpacity={0.8}>
                        <Text style={s.stopBtnText}>Stop</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
                        <Text style={s.deleteBtnText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Download button (below art+info) */}
              {!downloading && pending > 0 && (
                <TouchableOpacity style={s.dlBtn} onPress={handleDownload} activeOpacity={0.85}>
                  <Text style={s.dlBtnText}>⬇  Download {pending} track{pending !== 1 ? 's' : ''}</Text>
                </TouchableOpacity>
              )}

              {/* Download progress banner */}
              {downloading && (
                <View style={s.dlBanner}>
                  <ActivityIndicator size='small' color={C.green} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.dlBannerTitle} numberOfLines={1}>{dlTitle || '…'}</Text>
                    <Text style={s.dlBannerSub}>
                      Track {dlIdx}/{dlTotal} · {Math.round(dlProg * 100)}%
                      {fmtMB(dlWritten) ? (
                        `  ·  ${fmtMB(dlWritten)}${fmtMB(dlTotalBytes) ? ` / ${fmtMB(dlTotalBytes)}` : ''}`
                      ) : ''}
                    </Text>
                    <View style={s.dlBannerBar}>
                      <View style={[s.dlBannerFill, {
                        width: `${Math.min(100, ((dlIdx - 1 + dlProg) / dlTotal) * 100)}%`
                      }]} />
                    </View>
                    <Text style={s.dlBannerHint}>Continues in background</Text>
                  </View>
                </View>
              )}
            </LinearGradient>

            {/* Progress bar below header */}
            <View style={s.progressWrap}>
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: `${pct * 100}%`, backgroundColor: accentColor }]} />
              </View>
            </View>

            {/* Column headers — matches web */}
            <View style={s.colHeader}>
              <Text style={[s.colText, { width: 24, textAlign: 'center' }]}>#</Text>
              <View style={{ width: 40, flexShrink: 0 }} />
              <Text style={[s.colText, { flex: 1 }]}>TITLE</Text>
              <Text style={[s.colText, { width: 40, textAlign: 'right' }]}>TIME</Text>
            </View>
          </>
        }

        ListEmptyComponent={!loading && (
          <View style={s.emptyTracks}>
            <Text style={s.emptyTracksText}>No tracks yet.</Text>
            <Text style={s.emptyTracksSub}>Tap Download to save tracks to your phone.</Text>
          </View>
        )}

        renderItem={({ item: track, index }) => (
          <TrackRow
            track={track}
            index={index}
            isActive={currentTrack?.id === track.id}
            isPlaying={isPlaying}
            isDownloading={dlId === track.id}
            dlProgress={dlId === track.id ? dlProg : 0}
            onPress={() => {
              if (!track.is_downloaded) return
              if (currentTrack?.id === track.id) setIsPlaying(!isPlaying)
              else playTrack(track, tracks.filter(t => t.is_downloaded))
            }}
          />
        )}
      />
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  center:   { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: S.xl },
  retryBtn: { paddingVertical: 10, paddingHorizontal: S.lg },

  // Header
  header:      { paddingHorizontal: S.lg, paddingBottom: S.lg },
  headerInner: { flexDirection: 'row', alignItems: 'flex-end', gap: S.md, marginBottom: S.md },
  art:         { width: 140, height: 140, borderRadius: R.lg, overflow: 'hidden', flexShrink: 0, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  artImg:      { width: '100%', height: '100%' },
  artFallback: { width: '100%', height: '100%', backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },
  meta:        { flex: 1 },
  sourceLabel: { fontSize: 10, fontWeight: '900', color: 'rgba(255,255,255,0.6)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  plTitle:     { fontSize: 20, fontWeight: '900', color: C.white, marginBottom: 8, lineHeight: 26 },
  dlCount:     { fontSize: 12, color: C.textSub, marginBottom: 14 },
  dlPulse:     { color: '#facc15' },
  btns:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn:     { width: 52, height: 52, borderRadius: 26, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', shadowColor: C.green, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6 },
  playBtnIcon: { fontSize: 20, color: '#000', marginLeft: 3 },
  btnOff:      { opacity: 0.35 },
  stopBtn:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: R.full, borderWidth: 1, borderColor: 'rgba(231,20,41,0.6)' },
  stopBtnText: { color: C.red, fontSize: 13 },
  deleteBtn:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: R.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  deleteBtnText:{ color: 'rgba(255,255,255,0.7)', fontSize: 13 },

  dlBtn:       { backgroundColor: C.green, borderRadius: R.full, paddingVertical: 13, alignItems: 'center', marginTop: 4, shadowColor: C.green, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  dlBtnText:   { color: '#000', fontWeight: '900', fontSize: 15 },

  dlBanner:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(29,185,84,0.08)', borderRadius: R.md, padding: 14, borderWidth: 1, borderColor: 'rgba(29,185,84,0.2)', marginTop: S.sm },
  dlBannerTitle:{ color: C.white, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  dlBannerSub: { color: C.textSub, fontSize: 11, marginBottom: 6 },
  dlBannerBar: { height: 3, backgroundColor: C.elevated, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  dlBannerFill:{ height: '100%', backgroundColor: C.green, borderRadius: 2 },
  dlBannerHint:{ color: C.muted, fontSize: 10, fontStyle: 'italic' },

  progressWrap:{ paddingHorizontal: S.lg, marginBottom: S.sm },
  progressBg:  { height: 4, backgroundColor: C.elevated, borderRadius: 2, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: 2 },

  colHeader:   { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4 },
  colText:     { fontSize: 10, color: C.textSub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

  emptyTracks: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: S.xl },
  emptyTracksText:{ color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  emptyTracksSub: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
})

const tr = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, height: TRACK_H, gap: S.sm, borderRadius: R.sm },
  rowActive:{ backgroundColor: 'rgba(255,255,255,0.06)' },
  rowDim:   { opacity: 0.4 },
  num:      { width: 24, alignItems: 'center', flexShrink: 0 },
  numText:  { color: C.textSub, fontSize: 13 },
  thumb:    { width: 40, height: 40, borderRadius: R.xs, overflow: 'hidden', flexShrink: 0, backgroundColor: C.elevated },
  thumbImg: { width: 40, height: 40 },
  thumbFallback:{ alignItems: 'center', justifyContent: 'center' },
  info:     { flex: 1, minWidth: 0 },
  title:    { color: C.white, fontSize: 13, fontWeight: '500', marginBottom: 2 },
  artist:   { color: C.textSub, fontSize: 11 },
  dlBar:    { height: 2, backgroundColor: C.elevated, borderRadius: 1, marginTop: 4, overflow: 'hidden' },
  dlBarFill:{ height: '100%', backgroundColor: C.green, borderRadius: 1 },
  right:    { width: 40, alignItems: 'flex-end', flexShrink: 0 },
  dur:      { color: C.muted, fontSize: 11 },
})
