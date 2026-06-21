import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView,
  Platform, Modal, StatusBar,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useStore } from '../store/useStore'
import { fetchYouTubePlaylist, fetchSpotifyPlaylist, detectSource } from '../services/downloader'
import { savePlaylists, saveTrack } from '../services/db'
import uuid from '../services/uuid'
import { APP_VERSION } from '../services/updater'
import { C, R, S } from '../theme'

function extractPlaylistId(url, source) {
  if (source === 'youtube') {
    const m = url.match(/[?&]list=([^&#]+)/)
    return m ? m[1] : null
  }
  if (source === 'spotify') {
    const m = url.match(/playlist\/([a-zA-Z0-9]+)/)
    return m ? m[1] : null
  }
  return null
}

export default function AddMusicScreen() {
  const navigation = useNavigation()
  const { upsertPlaylist, playlists } = useStore()
  const [url, setUrl]     = useState('')
  const [busy, setBusy]   = useState(false)
  const [phase, setPhase] = useState('')

  const submit = async () => {
    const trimmed = url.trim()
    if (!trimmed) return

    // Duplicate check — extract the canonical playlist ID and compare against library
    try {
      const source = detectSource(trimmed)
      const newPlId = extractPlaylistId(trimmed, source)
      if (newPlId) {
        const duplicate = playlists.find(p => extractPlaylistId(p.url || '', p.source || '') === newPlId)
        if (duplicate) {
          Alert.alert(
            'Already in your library',
            `"${duplicate.title || 'This playlist'}" is already saved.`,
            [
              { text: 'OK', style: 'cancel' },
              { text: 'Open it', onPress: () => navigation.navigate('Playlist', { id: duplicate.id }) },
            ],
          )
          return
        }
      }
    } catch {
      // detectSource throws for bad URLs — let the main flow handle it below
    }

    setBusy(true)
    setPhase('Fetching playlist info…')
    try {
      const source = detectSource(trimmed)
      const data   = source === 'youtube'
        ? await fetchYouTubePlaylist(trimmed)
        : await fetchSpotifyPlaylist(trimmed)

      setPhase(`Saving ${data.tracks.length} tracks…`)

      const id = uuid()
      const pl = { id, ...data, url: trimmed, track_count: data.tracks.length }
      await savePlaylists(pl)
      for (const t of data.tracks) {
        await saveTrack({ ...t, id: t.id || uuid(), playlist_id: id, file_path: '', is_downloaded: false })
      }
      upsertPlaylist({ ...pl, downloaded_count: 0 })
      setUrl('')
      navigation.navigate('Playlist', { id })
    } catch (e) {
      Alert.alert('Could not load playlist', e.message)
    } finally {
      setBusy(false)
      setPhase('')
    }
  }

  const ready = url.trim().length > 0

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle='light-content' backgroundColor='transparent' translucent />

      {/* Loading overlay */}
      <Modal visible={busy} transparent animationType='fade'>
        <View style={s.overlay}>
          <View style={s.overlayCard}>
            <ActivityIndicator color={C.green} size='large' />
            <Text style={s.overlayPhase}>{phase}</Text>
            <Text style={s.overlaySub}>This may take a moment</Text>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <View style={s.titleRow}>
          <Text style={s.pageTitle}>Add Playlist</Text>
          <Text style={s.pageSub}>YouTube or Spotify</Text>
        </View>

        {/* URL input */}
        <View style={s.section}>
          <Text style={s.label}>PLAYLIST LINK</Text>
          <View style={[s.inputBox, ready && s.inputBoxActive]}>
            <Text style={s.inputPrefix}>↗</Text>
            <TextInput
              style={s.input}
              value={url}
              onChangeText={setUrl}
              placeholder='Paste your playlist URL here'
              placeholderTextColor={C.muted}
              autoCapitalize='none'
              autoCorrect={false}
              keyboardType='url'
              returnKeyType='go'
              onSubmitEditing={submit}
              editable={!busy}
              selectionColor={C.green}
            />
            {url.length > 0 && (
              <TouchableOpacity onPress={() => setUrl('')} hitSlop={12} style={s.clearBtn}>
                <Text style={s.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[s.addBtn, !ready && s.addBtnOff]}
            onPress={submit}
            disabled={!ready || busy}
            activeOpacity={0.85}
          >
            <Text style={s.addBtnText}>Add Playlist</Text>
          </TouchableOpacity>
        </View>

        {/* Supported sources */}
        <View style={s.section}>
          <Text style={s.label}>SUPPORTED SOURCES</Text>

          <View style={s.sourceCard}>
            <View style={[s.sourceIcon, { backgroundColor: 'rgba(255,68,68,0.12)' }]}>
              <Text style={[s.sourceIconText, { color: '#ff4444' }]}>▶</Text>
            </View>
            <View style={s.sourceInfo}>
              <Text style={s.sourceName}>YouTube Playlist</Text>
              <Text style={s.sourceUrl}>youtube.com/playlist?list=…</Text>
              <Text style={s.sourceNote}>Any public playlist</Text>
            </View>
            <View style={[s.sourceBadge, { backgroundColor: 'rgba(255,68,68,0.15)' }]}>
              <Text style={[s.sourceBadgeText, { color: '#ff4444' }]}>FREE</Text>
            </View>
          </View>

          <View style={s.sourceCard}>
            <View style={[s.sourceIcon, { backgroundColor: 'rgba(29,185,84,0.12)' }]}>
              <Text style={[s.sourceIconText, { color: C.green }]}>♦</Text>
            </View>
            <View style={s.sourceInfo}>
              <Text style={s.sourceName}>Spotify Playlist</Text>
              <Text style={s.sourceUrl}>open.spotify.com/playlist/…</Text>
              <Text style={s.sourceNote}>Public playlists only</Text>
            </View>
            <View style={[s.sourceBadge, { backgroundColor: 'rgba(29,185,84,0.15)' }]}>
              <Text style={[s.sourceBadgeText, { color: C.green }]}>FREE</Text>
            </View>
          </View>
        </View>

        {/* How it works */}
        <View style={s.section}>
          <Text style={s.label}>HOW IT WORKS</Text>
          <View style={s.stepsCard}>
            {[
              ['1', 'Paste a playlist URL above'],
              ['2', 'Open the playlist and tap Download'],
              ['3', 'Play music offline, anytime'],
            ].map(([num, text]) => (
              <View key={num} style={s.step}>
                <View style={s.stepNum}>
                  <Text style={s.stepNumText}>{num}</Text>
                </View>
                <Text style={s.stepText}>{text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* App version */}
        <Text style={s.version}>OfflineBeats v{APP_VERSION}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingTop: 56, paddingBottom: 100 },

  titleRow: { paddingHorizontal: S.md, marginBottom: S.xl },
  pageTitle:{ fontSize: 30, fontWeight: '900', color: C.white, marginBottom: 4, letterSpacing: -0.5 },
  pageSub:  { fontSize: 14, color: C.textSub },

  section: { paddingHorizontal: S.md, marginBottom: S.xl },
  label:   { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 1.5, marginBottom: 10 },

  inputBox:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 14, marginBottom: 14 },
  inputBoxActive:{ borderColor: C.green },
  inputPrefix:   { fontSize: 18, color: C.muted, marginRight: 10 },
  input:         { flex: 1, paddingVertical: 15, color: C.white, fontSize: 14 },
  clearBtn:      { padding: 4 },
  clearText:     { color: C.muted, fontSize: 13 },

  addBtn:    { backgroundColor: C.green, borderRadius: R.full, paddingVertical: 15, alignItems: 'center', shadowColor: C.green, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  addBtnOff: { opacity: 0.35 },
  addBtnText:{ color: '#000', fontWeight: '900', fontSize: 16 },

  sourceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.md, padding: 14, marginBottom: 10, gap: 12 },
  sourceIcon: { width: 42, height: 42, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sourceIconText: { fontSize: 18, fontWeight: '900' },
  sourceInfo: { flex: 1 },
  sourceName: { color: C.white, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  sourceUrl:  { color: C.muted, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 2 },
  sourceNote: { color: C.textSub, fontSize: 11 },
  sourceBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.sm },
  sourceBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  stepsCard: { backgroundColor: C.surface, borderRadius: R.md, padding: S.md, gap: 16 },
  step:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNum:   { width: 28, height: 28, borderRadius: 14, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText:{ color: '#000', fontWeight: '900', fontSize: 13 },
  stepText:  { color: C.textSub, fontSize: 14, flex: 1, lineHeight: 20 },

  version: { textAlign: 'center', color: C.muted, fontSize: 12, paddingBottom: 32 },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  overlayCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: 32, alignItems: 'center', gap: 14, width: '75%', borderWidth: 1, borderColor: C.border },
  overlayPhase:{ color: C.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  overlaySub:  { color: C.muted, fontSize: 13, textAlign: 'center' },
})
