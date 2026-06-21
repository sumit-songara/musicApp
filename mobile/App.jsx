import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Animated, Easing,
} from 'react-native'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import TrackPlayer, { Capability, AppKilledPlaybackBehavior, RepeatMode } from 'react-native-track-player'

import HomeScreen     from './src/screens/HomeScreen'
import PlaylistScreen from './src/screens/PlaylistScreen'
import AddMusicScreen from './src/screens/AddMusicScreen'
import MiniPlayer     from './src/components/Player'
import { initDb }     from './src/services/db'
import { checkForUpdate, downloadApk, installApk } from './src/services/updater'
import { setupNotifications } from './src/services/notifications'
import { C, TAB_BAR_H } from './src/theme'
import { useStore } from './src/store/useStore'

SplashScreen.preventAutoHideAsync().catch(() => {})

const Tab   = createBottomTabNavigator()
const Stack = createStackNavigator()

const NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: C.bg,
    card:       '#111111',
    text:       C.white,
    border:     'rgba(255,255,255,0.06)',
  },
}

function TabIcon({ name, focused }) {
  const cfg = {
    Library:    { on: '♫', off: '♪' },
    'Add Music':{ on: '⊕', off: '⊕' },
  }
  const icons = cfg[name] || { on: '●', off: '○' }
  return (
    <Text style={{ fontSize: 20, color: focused ? C.green : 'rgba(255,255,255,0.45)' }}>
      {focused ? icons.on : icons.off}
    </Text>
  )
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111111',
          borderTopColor: 'rgba(255,255,255,0.06)',
          height: TAB_BAR_H,
          paddingBottom: 10,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor:   C.green,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name='Library'    component={HomeScreen} />
      <Tab.Screen name='Add Music'  component={AddMusicScreen} />
    </Tab.Navigator>
  )
}

function ErrorScreen({ error }) {
  return (
    <View style={e.wrap}>
      <Text style={e.icon}>⚠</Text>
      <Text style={e.title}>Startup Error</Text>
      <Text style={e.msg}>{error?.message || String(error)}</Text>
      <Text style={e.hint}>Please force-close the app and reopen it.</Text>
    </View>
  )
}

// ── Update overlay ────────────────────────────────────────────────────────────

// phase: 'pending' | 'downloading' | 'ready' | 'error'
function UpdateOverlay({ info, phase, pct, errMsg, onUpdate, onLater, onInstall }) {
  const barWidth = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (phase !== 'downloading') return
    Animated.timing(barWidth, {
      toValue: pct,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
  }, [pct, phase])

  const isBlocking = phase === 'downloading' || phase === 'ready'

  return (
    <Modal
      visible
      transparent
      animationType='fade'
      statusBarTranslucent
      onRequestClose={() => {}}   // prevent back-button dismiss
    >
      <View style={u.backdrop}>
        <View style={u.card}>

          {/* ── Pending: update available ── */}
          {phase === 'pending' && (
            <>
              <View style={u.badge}>
                <Text style={u.badgeText}>UPDATE AVAILABLE</Text>
              </View>
              <Text style={u.version}>{info.version}</Text>
              <Text style={u.appName}>OfflineBeats</Text>
              {!!info.notes && (
                <View style={u.notesBox}>
                  <Text style={u.notesLabel}>WHAT'S NEW</Text>
                  <Text style={u.notesText} numberOfLines={6}>{info.notes}</Text>
                </View>
              )}
              <TouchableOpacity style={u.primaryBtn} onPress={onUpdate} activeOpacity={0.85}>
                <Text style={u.primaryBtnText}>Update Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={u.secondaryBtn} onPress={onLater} activeOpacity={0.7}>
                <Text style={u.secondaryBtnText}>Later</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Downloading ── */}
          {phase === 'downloading' && (
            <>
              <Text style={u.dlIcon}>⬇</Text>
              <Text style={u.dlTitle}>Downloading Update…</Text>
              <Text style={u.dlVersion}>{info.version}</Text>

              <View style={u.barTrack}>
                <Animated.View
                  style={[
                    u.barFill,
                    { width: barWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
                  ]}
                />
              </View>
              <Text style={u.pctText}>{pct}%</Text>
              <Text style={u.dlHint}>Please wait — do not close the app.</Text>
            </>
          )}

          {/* ── Ready to install ── */}
          {phase === 'ready' && (
            <>
              <Text style={u.doneIcon}>✓</Text>
              <Text style={u.doneTitle}>Download Complete!</Text>
              <Text style={u.doneBody}>
                Tap <Text style={{ fontWeight: '900', color: C.white }}>Install Now</Text> and follow the steps.{'\n\n'}
                After installing, <Text style={{ fontWeight: '900', color: C.white }}>close and reopen</Text> the app to finish.
              </Text>
              <TouchableOpacity style={u.primaryBtn} onPress={onInstall} activeOpacity={0.85}>
                <Text style={u.primaryBtnText}>Install Now</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Error ── */}
          {phase === 'error' && (
            <>
              <Text style={u.errIcon}>✕</Text>
              <Text style={u.errTitle}>Update Failed</Text>
              <Text style={u.errBody}>{errMsg || 'Could not download the update. Try again later.'}</Text>
              <TouchableOpacity style={u.secondaryBtn} onPress={onLater} activeOpacity={0.7}>
                <Text style={u.secondaryBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </>
          )}

        </View>
      </View>
    </Modal>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [ready, setReady]           = useState(false)
  const [error, setError]           = useState(null)

  // Update flow state
  const [updateInfo,  setUpdateInfo]  = useState(null)   // { version, apkUrl, notes }
  const [updatePhase, setUpdatePhase] = useState(null)   // null | 'pending' | 'downloading' | 'ready' | 'error'
  const [updatePct,   setUpdatePct]   = useState(0)
  const [updateErr,   setUpdateErr]   = useState(null)
  const apkUriRef = useRef(null)

  useEffect(() => {
    ;(async () => {
      try {
        await initDb()
        await setupNotifications()
        try {
          await TrackPlayer.setupPlayer({ autoHandleInterruptions: true })
        } catch (e) {
          if (!e?.message?.includes('already')) throw e
        }
        await new Promise(r => setTimeout(r, 300))
        await TrackPlayer.updateOptions({
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          compactCapabilities: [Capability.SkipToPrevious, Capability.Pause, Capability.SkipToNext],
          progressUpdateEventInterval: 1,
        })
        await TrackPlayer.setRepeatMode(RepeatMode.Queue)
      } catch (err) {
        setError(err)
      } finally {
        setReady(true)
        await SplashScreen.hideAsync().catch(() => {})
        // Check for updates after splash — show overlay if one is found
        checkForUpdate()
          .then(info => { if (info) { setUpdateInfo(info); setUpdatePhase('pending') } })
          .catch(() => {})
      }
    })()
  }, [])

  const handleUpdateNow = async () => {
    setUpdatePhase('downloading')
    setUpdatePct(0)
    try {
      const uri = await downloadApk(updateInfo.apkUrl, pct => setUpdatePct(pct))
      apkUriRef.current = uri
      setUpdatePhase('ready')
    } catch (err) {
      setUpdateErr(err.message)
      setUpdatePhase('error')
    }
  }

  const handleInstall = async () => {
    try {
      await installApk(apkUriRef.current)
      // Android installer takes over — app will be killed and relaunched after install
    } catch (err) {
      setUpdateErr(err.message)
      setUpdatePhase('error')
    }
  }

  const handleLater = () => setUpdatePhase(null)

  if (!ready) return null

  if (error) return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorScreen error={error} />
        <StatusBar style='light' />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={NavTheme}>
          <Stack.Navigator
            screenOptions={{
              headerStyle:       { backgroundColor: '#111111' },
              headerTintColor:   C.white,
              headerTitleStyle:  { fontWeight: '900', fontSize: 17 },
              headerShadowVisible: false,
              cardStyle:         { backgroundColor: C.bg },
            }}
          >
            <Stack.Screen name='Home'     component={Tabs}           options={{ headerShown: false }} />
            <Stack.Screen name='Playlist' component={PlaylistScreen} options={{ title: '', headerBackTitle: 'Back' }} />
          </Stack.Navigator>

          <PlayerWrapper />
        </NavigationContainer>

        {/* Update overlay — shown on top of everything */}
        {updateInfo && updatePhase && (
          <UpdateOverlay
            info={updateInfo}
            phase={updatePhase}
            pct={updatePct}
            errMsg={updateErr}
            onUpdate={handleUpdateNow}
            onLater={handleLater}
            onInstall={handleInstall}
          />
        )}

        <StatusBar style='light' />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function PlayerWrapper() {
  const currentTrack   = useStore(s => s.currentTrack)
  const fullPlayerOpen = useStore(s => s.fullPlayerOpen)
  if (!currentTrack && !fullPlayerOpen) return null
  return <MiniPlayer />
}

// ── Styles ────────────────────────────────────────────────────────────────────

const e = StyleSheet.create({
  wrap:  { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon:  { fontSize: 48, color: '#facc15', marginBottom: 16 },
  title: { color: C.white, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  msg:   { color: C.textSub, fontSize: 13, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  hint:  { color: C.muted, fontSize: 12 },
})

const u = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // Pending
  badge:        { backgroundColor: 'rgba(29,185,84,0.15)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 16 },
  badgeText:    { color: C.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  version:      { color: C.green, fontSize: 32, fontWeight: '900', marginBottom: 2 },
  appName:      { color: C.textSub, fontSize: 14, marginBottom: 20 },
  notesBox:     { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 14, marginBottom: 20 },
  notesLabel:   { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  notesText:    { color: C.textSub, fontSize: 13, lineHeight: 20 },

  primaryBtn:     { width: '100%', backgroundColor: C.green, borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  primaryBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },
  secondaryBtn:     { paddingVertical: 10, paddingHorizontal: 20 },
  secondaryBtnText: { color: C.muted, fontSize: 14 },

  // Downloading
  dlIcon:    { fontSize: 36, marginBottom: 16, color: C.green },
  dlTitle:   { color: C.white, fontSize: 20, fontWeight: '900', marginBottom: 4 },
  dlVersion: { color: C.textSub, fontSize: 13, marginBottom: 24 },
  barTrack:  { width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden', marginBottom: 10 },
  barFill:   { height: '100%', backgroundColor: C.green, borderRadius: 999 },
  pctText:   { color: C.white, fontSize: 22, fontWeight: '900', marginBottom: 8 },
  dlHint:    { color: C.muted, fontSize: 12, textAlign: 'center' },

  // Ready
  doneIcon:  { fontSize: 48, color: C.green, marginBottom: 12 },
  doneTitle: { color: C.white, fontSize: 22, fontWeight: '900', marginBottom: 12 },
  doneBody:  { color: C.textSub, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 24 },

  // Error
  errIcon:  { fontSize: 36, color: '#ff4444', marginBottom: 12 },
  errTitle: { color: C.white, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  errBody:  { color: C.textSub, fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
})
