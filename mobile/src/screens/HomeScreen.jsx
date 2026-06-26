import { useCallback, useState, useEffect, memo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, Dimensions, Platform, StatusBar,
  TextInput, KeyboardAvoidingView,
  Alert,
} from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import * as FileSystem from 'expo-file-system'
import { useStore } from '../store/useStore'
import {
  getPlaylists, deletePlaylistFromDb,
  updatePlaylistTitle, updatePlaylistSortOrders,
} from '../services/db'
import { C, R, S, TAB_BAR_H, PLAYER_H } from '../theme'

const { width: SW } = Dimensions.get('window')
const CARD_W = (SW - S.md * 2 - 12) / 2

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const SRC_COLOR = { youtube: '#ff4444', spotify: C.green }
const SRC_LABEL = { youtube: 'YouTube', spotify: 'Spotify' }

// ── Rename modal (cross-platform, TextInput-based) ────────────────────────────
function RenameOverlay({ playlist, onSave, onClose }) {
  const [name, setName] = useState(playlist?.title ?? '')
  const save = () => { const t = name.trim(); if (t) onSave(t) }
  return (
    <View style={rm.root}>
      <View style={rm.backdrop} />
      <KeyboardAvoidingView
        style={rm.center}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents='box-none'
      >
        <View style={rm.sheet}>
          <Text style={rm.title}>Rename playlist</Text>
          <TextInput
            style={rm.input}
            value={name}
            onChangeText={setName}
            autoFocus
            selectTextOnFocus
            placeholder='Playlist name'
            placeholderTextColor={C.muted}
            returnKeyType='done'
            onSubmitEditing={save}
          />
          <View style={rm.row}>
            <TouchableOpacity style={rm.cancelBtn} onPress={onClose} activeOpacity={0.75}>
              <Text style={rm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rm.saveBtn} onPress={save} activeOpacity={0.85}>
              <Text style={rm.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

// ── Playlist card ─────────────────────────────────────────────────────────────
const PlaylistCard = memo(({ pl, onPress, onLongPress }) => {
  const accent   = SRC_COLOR[pl.source] || C.green
  const total    = pl.track_count || 0
  const dl       = pl.downloaded_count || 0
  const pct      = total > 0 ? dl / total : 0
  const complete = dl === total && total > 0

  return (
    <TouchableOpacity
      style={card.wrap}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.82}
    >
      {/* Album art */}
      <View style={card.artBox}>
        {pl.thumbnail
          ? <Image source={{ uri: pl.thumbnail }} style={card.art} resizeMode='cover' />
          : <View style={[card.art, card.artFallback]}>
              <Text style={{ fontSize: 32, color: C.muted }}>♫</Text>
            </View>
        }
        <View style={[card.badge, { backgroundColor: accent }]}>
          <Text style={card.badgeText}>{SRC_LABEL[pl.source] || pl.source}</Text>
        </View>
        <View style={card.playBtn}>
          <Text style={card.playIcon}>▶</Text>
        </View>
      </View>

      {/* Info */}
      <View style={card.info}>
        <Text style={card.title} numberOfLines={2}>{pl.title}</Text>
        <Text style={card.count}>{dl} / {total} tracks</Text>
        {total > 0 && (
          <View style={card.barBg}>
            <View style={[card.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: complete ? C.green : accent }]} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
})

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation()
  const { playlists, setPlaylists, removePlaylist, dl, cancelDownload } = useStore()
  const [loading, setLoading]   = useState(true)
  const [renaming, setRenaming] = useState(null)   // playlist object being renamed

  const load = useCallback(() => {
    getPlaylists()
      .then(data => { setPlaylists(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useFocusEffect(load)

  // ── Rename ──────────────────────────────────────────────────────────────────
  const handleRename = useCallback(async (newTitle) => {
    if (!renaming) return
    await updatePlaylistTitle(renaming.id, newTitle)
    setPlaylists(playlists.map(p => p.id === renaming.id ? { ...p, title: newTitle } : p))
    setRenaming(null)
  }, [renaming, playlists, setPlaylists])

  // ── Reorder ─────────────────────────────────────────────────────────────────
  const movePlaylist = useCallback(async (id, dir) => {
    const idx = playlists.findIndex(p => p.id === id)
    const next = idx + dir
    if (next < 0 || next >= playlists.length) return
    const newOrder = [...playlists]
    ;[newOrder[idx], newOrder[next]] = [newOrder[next], newOrder[idx]]
    setPlaylists(newOrder)
    await updatePlaylistSortOrders(newOrder.map(p => p.id))
  }, [playlists, setPlaylists])

  // ── Delete from home screen ─────────────────────────────────────────────────
  const handleDeletePlaylist = useCallback((pl) => {
    Alert.alert('Delete Playlist', `Remove "${pl.title}" and all downloaded files?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (dl.playlistId === pl.id) await cancelDownload()
          const filePaths = await deletePlaylistFromDb(pl.id)
          for (const p of filePaths) {
            await FileSystem.deleteAsync(p, { idempotent: true }).catch(() => {})
          }
          removePlaylist(pl.id)
        },
      },
    ])
  }, [dl, cancelDownload, removePlaylist])

  // ── Long-press action sheet ─────────────────────────────────────────────────
  const handleLongPress = useCallback((pl) => {
    const idx    = playlists.findIndex(p => p.id === pl.id)
    const canUp  = idx > 0
    const canDown = idx < playlists.length - 1

    Alert.alert(pl.title, 'What would you like to do?', [
      { text: '✏️  Rename',       onPress: () => setTimeout(() => setRenaming(pl), 300) },
      canUp   ? { text: '↑  Move Up',   onPress: () => movePlaylist(pl.id, -1) } : null,
      canDown ? { text: '↓  Move Down', onPress: () => movePlaylist(pl.id, +1) } : null,
      { text: '🗑  Delete',       style: 'destructive', onPress: () => handleDeletePlaylist(pl) },
      { text: 'Cancel',           style: 'cancel' },
    ].filter(Boolean))
  }, [playlists, movePlaylist, handleDeletePlaylist])

  const totalDl     = playlists.reduce((s, p) => s + (p.downloaded_count || 0), 0)
  const totalTracks = playlists.reduce((s, p) => s + (p.track_count || 0), 0)
  const hasPlayer   = !!useStore.getState().currentTrack

  const renderCard = useCallback(({ item }) => (
    <PlaylistCard
      pl={item}
      onPress={() => navigation.navigate('Playlist', { id: item.id })}
      onLongPress={() => handleLongPress(item)}
    />
  ), [navigation, handleLongPress])

  return (
    <View style={s.root}>
      <StatusBar barStyle='light-content' backgroundColor='transparent' translucent />

      <FlatList
        data={playlists}
        keyExtractor={p => p.id}
        numColumns={2}
        columnWrapperStyle={s.colWrap}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.list, { paddingBottom: TAB_BAR_H + (hasPlayer ? PLAYER_H : 0) + 24 }]}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={renderCard}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={['#1a3a24', '#0e1f14', C.bg]}
              style={s.hero}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            >
              <View style={s.logoRow}>
                <View style={s.logoCircle}>
                  <Text style={s.logoIcon}>♫</Text>
                </View>
                <Text style={s.appName}>OfflineBeats</Text>
              </View>

              <Text style={s.greeting}>{greeting()}</Text>

              {playlists.length > 0
                ? (
                  <View style={s.statsRow}>
                    <View style={s.statPill}>
                      <Text style={s.statNum}>{playlists.length}</Text>
                      <Text style={s.statLbl}>playlist{playlists.length !== 1 ? 's' : ''}</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statPill}>
                      <Text style={s.statNum}>{totalDl}</Text>
                      <Text style={s.statLbl}>downloaded</Text>
                    </View>
                    {totalTracks > 0 && (
                      <>
                        <View style={s.statDivider} />
                        <View style={s.statPill}>
                          <Text style={s.statNum}>{totalTracks}</Text>
                          <Text style={s.statLbl}>total tracks</Text>
                        </View>
                      </>
                    )}
                  </View>
                )
                : (
                  <Text style={s.heroSub}>Your offline music library</Text>
                )
              }
            </LinearGradient>

            {playlists.length > 0 && (
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>Your Library</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Add Music')}
                  style={s.addBtn}
                  activeOpacity={0.75}
                >
                  <Text style={s.addBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && playlists.length === 0 && (
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <Text style={{ fontSize: 40, color: C.green }}>♫</Text>
                </View>
                <Text style={s.emptyTitle}>No playlists yet</Text>
                <Text style={s.emptyBody}>
                  Paste a YouTube or Spotify playlist URL to download everything for offline playback.
                </Text>
                <TouchableOpacity
                  style={s.emptyBtn}
                  onPress={() => navigation.navigate('Add Music')}
                  activeOpacity={0.85}
                >
                  <Text style={s.emptyBtnText}>Add your first playlist</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
      />

      {renaming && (
        <RenameOverlay
          playlist={renaming}
          onSave={handleRename}
          onClose={() => setRenaming(null)}
        />
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  list:    {},
  colWrap: { paddingHorizontal: S.md, gap: 12, marginBottom: 12 },

  hero:       { paddingHorizontal: S.md, paddingTop: 52, paddingBottom: 28 },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 18 },
  logoCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  logoIcon:   { fontSize: 13, color: '#000', fontWeight: '900' },
  appName:    { color: C.white, fontWeight: '900', fontSize: 16, letterSpacing: 0.2 },
  greeting:   { fontSize: 28, fontWeight: '900', color: C.white, marginBottom: 16, letterSpacing: -0.5 },
  heroSub:    { fontSize: 14, color: C.textSub },

  statsRow:    { flexDirection: 'row', alignItems: 'center', gap: 0 },
  statPill:    { alignItems: 'center', paddingHorizontal: 14 },
  statNum:     { fontSize: 22, fontWeight: '900', color: C.white, lineHeight: 26 },
  statLbl:     { fontSize: 11, color: C.textSub, marginTop: 1 },
  statDivider: { width: 1, height: 32, backgroundColor: C.border },

  sectionRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.md, marginTop: 4, marginBottom: 14 },
  sectionTitle:{ fontSize: 18, fontWeight: '900', color: C.white },
  addBtn:      { paddingHorizontal: 14, paddingVertical: 6, borderRadius: R.full, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  addBtnText:  { fontSize: 13, fontWeight: '700', color: C.green },

  empty:       { marginHorizontal: S.md, marginTop: 8, borderRadius: R.xl, backgroundColor: C.surface, padding: S.xl, alignItems: 'center' },
  emptyIcon:   { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(29,185,84,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: S.md },
  emptyTitle:  { fontSize: 18, fontWeight: '900', color: C.white, marginBottom: 8 },
  emptyBody:   { fontSize: 13, color: C.textSub, textAlign: 'center', lineHeight: 20, marginBottom: S.lg, maxWidth: 260 },
  emptyBtn:    { paddingHorizontal: S.xl, paddingVertical: 13, borderRadius: R.full, backgroundColor: C.green },
  emptyBtnText:{ color: '#000', fontWeight: '900', fontSize: 14 },
})

const card = StyleSheet.create({
  wrap:       { width: CARD_W, backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden' },

  artBox:     { width: '100%', aspectRatio: 1, backgroundColor: C.elevated, position: 'relative' },
  art:        { width: '100%', height: '100%' },
  artFallback:{ alignItems: 'center', justifyContent: 'center' },

  badge:      { position: 'absolute', top: 7, left: 7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText:  { fontSize: 9, fontWeight: '900', color: '#000', letterSpacing: 0.3, textTransform: 'uppercase' },

  playBtn:    { position: 'absolute', bottom: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  playIcon:   { fontSize: 12, color: '#000', marginLeft: 2 },

  info:       { padding: 10, paddingTop: 8 },
  title:      { fontSize: 13, fontWeight: '700', color: C.white, lineHeight: 18, marginBottom: 3 },
  count:      { fontSize: 11, color: C.textSub, marginBottom: 6 },

  barBg:      { height: 3, backgroundColor: C.elevated2, borderRadius: 2, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 2 },
})

const rm = StyleSheet.create({
  root:    { ...StyleSheet.absoluteFillObject, zIndex: 999, elevation: 20 },
  backdrop:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  center:  { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: S.lg },
  sheet:   { width: '100%', backgroundColor: C.elevated, borderRadius: R.xl, padding: S.lg },
  title:   { color: C.white, fontSize: 16, fontWeight: '900', marginBottom: S.md, textAlign: 'center' },
  input:   {
    backgroundColor: C.surface, borderRadius: R.md, paddingHorizontal: S.md,
    paddingVertical: 12, color: C.white, fontSize: 15, borderWidth: 1,
    borderColor: C.border, marginBottom: S.md,
  },
  row:        { flexDirection: 'row', gap: 10 },
  cancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: R.full, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.textSub, fontWeight: '700', fontSize: 14 },
  saveBtn:    { flex: 1, paddingVertical: 12, borderRadius: R.full, backgroundColor: C.green, alignItems: 'center' },
  saveText:   { color: '#000', fontWeight: '900', fontSize: 14 },
})
