import { useEffect, useRef, memo } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  Modal, Dimensions, Pressable, Animated, Platform,
} from 'react-native'
import Slider from '@react-native-community/slider'
import TrackPlayer, {
  Event,
  useTrackPlayerEvents,
  useProgress,
} from 'react-native-track-player'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { useStore } from '../store/useStore'
import { C, R, S, TAB_BAR_H, PLAYER_H } from '../theme'

const { width: SW } = Dimensions.get('window')

// ── Audio engine ──────────────────────────────────────────────────────────────
// Loads all downloaded queue tracks into RNTP so Android shows Prev/Next on the
// lock screen. Syncs RNTP ↔ store on every track change.

export function useAudioEngine() {
  const { isPlaying, setIsPlaying, setPosition, setDuration } = useStore()
  const currentTrack = useStore(s => s.currentTrack)
  const queue        = useStore(s => s.queue)

  // Track IDs currently loaded in RNTP (in queue order)
  const rntp_ids  = useRef([])
  // Prevent PlaybackActiveTrackChanged from triggering a feedback loop
  const syncing   = useRef(false)

  const progress = useProgress(1)
  useEffect(() => {
    setPosition(Math.floor(progress.position))
    setDuration(Math.floor(progress.duration || 0))
  }, [progress.position, progress.duration])

  // Reload RNTP queue whenever the playing track changes
  useEffect(() => {
    if (!currentTrack?.file_path) return
    let cancelled = false
    ;(async () => {
      try {
        if (Platform.OS === 'android') await new Promise(r => setTimeout(r, 80))
        if (cancelled) return

        syncing.current = true

        // If this track is already in RNTP's queue, just skip — no full reset needed
        const existingIdx = rntp_ids.current.indexOf(String(currentTrack.id))
        if (existingIdx >= 0) {
          const active = await TrackPlayer.getActiveTrack().catch(() => null)
          if (active?.id !== String(currentTrack.id)) {
            await TrackPlayer.skip(existingIdx)
          }
        } else {
          // Full reload: put every downloaded track in the queue so Android
          // shows Prev / Next on the lock screen
          const downloadedTracks = (queue || []).filter(t => t.file_path)
          const tracksToLoad = downloadedTracks.length > 0 ? downloadedTracks : [currentTrack]

          await TrackPlayer.reset()
          if (cancelled) { syncing.current = false; return }

          await TrackPlayer.add(tracksToLoad.map(t => ({
            id:      String(t.id),
            url:     t.file_path,
            title:   t.title  || 'Unknown',
            artist:  t.artist || 'Unknown',
            artwork: t.thumbnail || undefined,
          })))
          rntp_ids.current = tracksToLoad.map(t => String(t.id))

          const newIdx = rntp_ids.current.indexOf(String(currentTrack.id))
          if (newIdx > 0) await TrackPlayer.skip(newIdx)
        }

        if (cancelled) { syncing.current = false; return }
        if (useStore.getState().isPlaying) await TrackPlayer.play()
        syncing.current = false
      } catch (err) {
        syncing.current = false
        console.warn('[TrackPlayer] load failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [currentTrack?.id])  // key on ID so we skip on navigation, reset on new playlist

  // Sync in-app play/pause taps → RNTP
  useEffect(() => {
    isPlaying ? TrackPlayer.play().catch(() => {}) : TrackPlayer.pause().catch(() => {})
  }, [isPlaying])

  // RNTP advanced to a different track (natural finish or lock-screen Prev/Next)
  // → sync the store so the UI reflects the new track
  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], async ({ index }) => {
    if (syncing.current) return
    if (index == null || index < 0) return
    const trackId = rntp_ids.current[index]
    if (!trackId) return
    const { queue: q, currentTrack: ct } = useStore.getState()
    if (ct && String(ct.id) === trackId) return   // already in sync
    const track = q.find(t => String(t.id) === trackId)
    if (!track) return
    const qIdx = q.findIndex(t => t.id === track.id)
    useStore.setState({ currentTrack: track, queueIndex: qIdx, isPlaying: true })
  })

  // Entire RNTP queue finished → let the store handle repeat / stop
  useTrackPlayerEvents([Event.PlaybackQueueEnded], () => {
    useStore.getState().playNext()
  })

  const seek = async (secs) => {
    await TrackPlayer.seekTo(Math.round(secs)).catch(() => {})
    setPosition(Math.round(secs))
  }

  return { seek }
}

// ── Animated now-playing bars ─────────────────────────────────────────────────
const NowPlayingBars = memo(function NowPlayingBars() {
  const a1 = useRef(new Animated.Value(0)).current
  const a2 = useRef(new Animated.Value(0)).current
  const a3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = (a, delay) => Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 550, delay, useNativeDriver: false }),
        Animated.timing(a, { toValue: 0, duration: 550, useNativeDriver: false }),
      ])
    )
    const l1 = loop(a1, 0); const l2 = loop(a2, 220); const l3 = loop(a3, 440)
    l1.start(); l2.start(); l3.start()
    return () => { l1.stop(); l2.stop(); l3.stop() }
  }, [])

  const bar = a => ({
    width: 3, borderRadius: 2, backgroundColor: C.green, marginHorizontal: 1,
    height: a.interpolate({ inputRange: [0, 1], outputRange: [4, 14] }),
  })

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 14 }}>
      <Animated.View style={bar(a1)} />
      <Animated.View style={bar(a2)} />
      <Animated.View style={bar(a3)} />
    </View>
  )
})

function fmt(s) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// ── Full screen player ────────────────────────────────────────────────────────
function FullPlayer({ seek }) {
  const insets         = useSafeAreaInsets()
  const currentTrack   = useStore(s => s.currentTrack)
  const isPlaying      = useStore(s => s.isPlaying)
  const position       = useStore(s => s.position)
  const duration       = useStore(s => s.duration)
  const shuffle        = useStore(s => s.shuffle)
  const repeat         = useStore(s => s.repeat)
  const setIsPlaying   = useStore(s => s.setIsPlaying)
  const playNext       = useStore(s => s.playNext)
  const playPrev       = useStore(s => s.playPrev)
  const toggleShuffle  = useStore(s => s.toggleShuffle)
  const cycleRepeat    = useStore(s => s.cycleRepeat)
  const setFullPlayerOpen = useStore(s => s.setFullPlayerOpen)

  if (!currentTrack) return null

  const repeatActive = repeat !== 'off'

  return (
    <Modal visible animationType='slide' statusBarTranslucent onRequestClose={() => setFullPlayerOpen(false)}>
      <View style={fp.root}>
        {/* Blurred background */}
        {currentTrack.thumbnail ? (
          <>
            <Image source={{ uri: currentTrack.thumbnail }} style={fp.bgImg} blurRadius={28} />
            <View style={fp.bgDim} />
          </>
        ) : (
          <LinearGradient colors={['#1a3d25', '#121212']} style={StyleSheet.absoluteFill} />
        )}

        {/* Header */}
        <View style={[fp.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => setFullPlayerOpen(false)} style={fp.headerBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-down" size={26} color={C.textSub} />
          </TouchableOpacity>
          <Text style={fp.headerLabel}>NOW PLAYING</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Art — flex: 1 so it fills available space, eliminating the bottom gap */}
        <View style={fp.artWrap}>
          {currentTrack.thumbnail ? (
            <Image source={{ uri: currentTrack.thumbnail }} style={fp.art} resizeMode='cover' />
          ) : (
            <View style={[fp.art, fp.artFallback]}>
              <Text style={{ fontSize: 64, color: C.muted }}>♫</Text>
            </View>
          )}
        </View>

        {/* Bottom block: info + seek + controls */}
        <View style={fp.bottomBlock}>
          {/* Track info */}
          <View style={fp.infoRow}>
            <Text style={fp.trackTitle} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={fp.trackArtist} numberOfLines={1}>{currentTrack.artist}</Text>
          </View>

          {/* Seek bar */}
          <View style={fp.seekWrap}>
            <Slider
              style={fp.slider}
              minimumValue={0}
              maximumValue={duration > 0 ? duration : 1}
              value={position}
              onSlidingComplete={seek}
              minimumTrackTintColor={C.green}
              maximumTrackTintColor='rgba(255,255,255,0.18)'
              thumbTintColor={C.white}
            />
            <View style={fp.timeRow}>
              <Text style={fp.timeText}>{fmt(position)}</Text>
              <Text style={fp.timeText}>{fmt(duration)}</Text>
            </View>
          </View>

          {/* Controls: shuffle | prev | play/pause | next | repeat */}
          <View style={fp.controls}>
            <TouchableOpacity onPress={toggleShuffle} style={fp.sideCtrl} activeOpacity={0.7}>
              <Ionicons name="shuffle" size={22} color={shuffle ? C.green : C.muted} />
              {shuffle && <View style={fp.dot} />}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => position > 3 ? seek(0) : playPrev()}
              style={fp.skipCtrl}
              activeOpacity={0.7}
            >
              <Ionicons name="play-skip-back" size={28} color={C.white} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsPlaying(!isPlaying)}
              style={fp.playBtn}
              activeOpacity={0.9}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={34}
                color="#000"
                style={isPlaying ? undefined : { marginLeft: 4 }}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={playNext} style={fp.skipCtrl} activeOpacity={0.7}>
              <Ionicons name="play-skip-forward" size={28} color={C.white} />
            </TouchableOpacity>

            <TouchableOpacity onPress={cycleRepeat} style={fp.sideCtrl} activeOpacity={0.7}>
              <MaterialIcons
                name={repeat === 'one' ? 'repeat-one' : 'repeat'}
                size={22}
                color={repeatActive ? C.green : C.muted}
              />
              {repeatActive && <View style={fp.dot} />}
            </TouchableOpacity>
          </View>

          <View style={{ height: Math.max(insets.bottom, 16) }} />
        </View>
      </View>
    </Modal>
  )
}

// ── Mini player ───────────────────────────────────────────────────────────────
export default function MiniPlayer() {
  const insets         = useSafeAreaInsets()
  const currentTrack   = useStore(s => s.currentTrack)
  const isPlaying      = useStore(s => s.isPlaying)
  const position       = useStore(s => s.position)
  const duration       = useStore(s => s.duration)
  const fullPlayerOpen = useStore(s => s.fullPlayerOpen)
  const setIsPlaying   = useStore(s => s.setIsPlaying)
  const playNext       = useStore(s => s.playNext)
  const playPrev       = useStore(s => s.playPrev)
  const setFullPlayerOpen = useStore(s => s.setFullPlayerOpen)
  const { seek } = useAudioEngine()

  if (!currentTrack) return null

  const pct = duration > 0 ? position / duration : 0

  return (
    <>
      {fullPlayerOpen && <FullPlayer seek={seek} />}

      <Pressable
        style={[mp.container, { bottom: TAB_BAR_H + insets.bottom }]}
        onPress={() => setFullPlayerOpen(true)}
        android_ripple={null}
      >
        {/* Progress line */}
        <View style={mp.progressBar}>
          <View style={[mp.progressFill, { width: `${pct * 100}%` }]} />
        </View>

        <View style={mp.inner}>
          <View style={mp.left}>
            {currentTrack.thumbnail ? (
              <Image source={{ uri: currentTrack.thumbnail }} style={mp.art} />
            ) : (
              <View style={[mp.art, mp.artFallback]}><Text style={{ fontSize: 18, color: C.muted }}>♫</Text></View>
            )}
            <View style={mp.info}>
              <Text style={mp.title} numberOfLines={1}>{currentTrack.title}</Text>
              <Text style={mp.artist} numberOfLines={1}>{currentTrack.artist}</Text>
            </View>
          </View>

          <View style={mp.controls}>
            <TouchableOpacity
              onPress={e => { e.stopPropagation?.(); position > 3 ? seek(0) : playPrev() }}
              style={mp.ctrl} hitSlop={10} activeOpacity={0.7}
            >
              <Ionicons name="play-skip-back" size={18} color={C.textSub} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={e => { e.stopPropagation?.(); setIsPlaying(!isPlaying) }}
              style={mp.playBtn} hitSlop={6} activeOpacity={0.85}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={16} color="#000"
                style={isPlaying ? undefined : { marginLeft: 2 }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={e => { e.stopPropagation?.(); playNext() }}
              style={mp.ctrl} hitSlop={10} activeOpacity={0.7}
            >
              <Ionicons name="play-skip-forward" size={18} color={C.textSub} />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const mp = StyleSheet.create({
  container:   {
    position: 'absolute', left: 0, right: 0,
    height: PLAYER_H,
    backgroundColor: C.player,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
  },
  progressBar:  { height: 2, width: '100%', backgroundColor: 'rgba(255,255,255,0.1)' },
  progressFill: { height: '100%', backgroundColor: C.green },
  inner:    { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, gap: 8 },
  left:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  art:      { width: 46, height: 46, borderRadius: R.sm, flexShrink: 0, backgroundColor: C.elevated },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  info:     { flex: 1, minWidth: 0 },
  title:    { color: C.white, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  artist:   { color: C.textSub, fontSize: 11, marginTop: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  ctrl:     { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  playBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
})

const ART_SIZE = Math.min(SW - S.xl * 2, 320)

const fp = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#0e0e0e' },
  bgImg:   { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  bgDim:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)' },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, paddingBottom: 6 },
  headerBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { color: C.textSub, fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  // flex: 1 makes the art section absorb all vertical space, pushing controls to bottom
  artWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.xl },
  art:        { width: ART_SIZE, height: ART_SIZE, borderRadius: R.lg, shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  artFallback:{ backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },

  bottomBlock: { paddingHorizontal: S.lg },

  infoRow:    { marginBottom: S.md },
  trackTitle: { color: C.white, fontSize: 22, fontWeight: '900', marginBottom: 4, lineHeight: 28 },
  trackArtist:{ color: C.textSub, fontSize: 15 },

  seekWrap:   { marginBottom: S.sm },
  slider:     { width: '100%', height: 40, marginHorizontal: -S.xs },
  timeRow:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  timeText:   { color: C.muted, fontSize: 11 },

  controls:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.xs, marginBottom: S.md },
  sideCtrl:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot:        { width: 4, height: 4, borderRadius: 2, backgroundColor: C.green, marginTop: 2 },
  skipCtrl:   { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  playBtn:    { width: 68, height: 68, borderRadius: 34, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
})
