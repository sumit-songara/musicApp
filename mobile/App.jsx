import { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import TrackPlayer, { Capability, AppKilledPlaybackBehavior } from 'react-native-track-player'

import HomeScreen     from './src/screens/HomeScreen'
import PlaylistScreen from './src/screens/PlaylistScreen'
import AddMusicScreen from './src/screens/AddMusicScreen'
import MiniPlayer     from './src/components/Player'
import { initDb }     from './src/services/db'
import { checkForUpdate } from './src/services/updater'
import { setupNotifications } from './src/services/notifications'
import { C, TAB_BAR_H } from './src/theme'
import { useStore } from './src/store/useStore'

// Hold splash screen until we're ready
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
    Library:   { on: '♫', off: '♪' },
    'Add Music':{ on: '⊕', off: '⊕' },
  }
  const icons = cfg[name] || { on: '●', off: '○' }
  return (
    <Text style={{
      fontSize: 20,
      color: focused ? C.green : 'rgba(255,255,255,0.45)',
    }}>
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

const e = StyleSheet.create({
  wrap:  { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon:  { fontSize: 48, color: '#facc15', marginBottom: 16 },
  title: { color: C.white, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  msg:   { color: C.textSub, fontSize: 13, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  hint:  { color: C.muted, fontSize: 12 },
})

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        await initDb()
        await setupNotifications()
        // Set up TrackPlayer for lock screen / notification controls.
        // Only swallow "already initialized" — real errors propagate.
        try {
          await TrackPlayer.setupPlayer({ autoHandleInterruptions: true })
        } catch (e) {
          if (!e?.message?.includes('already')) throw e
        }
        // RNTP 4.1.2 race: isServiceBound is set after the setupPlayer promise resolves.
        // A small delay ensures the native flag is true before updateOptions checks it.
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
      } catch (err) {
        setError(err)
      } finally {
        setReady(true)
        await SplashScreen.hideAsync().catch(() => {})
        // Check for updates in background — doesn't block startup
        checkForUpdate().catch(() => {})
      }
    })()
  }, [])

  // Still on splash
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
            <Stack.Screen
              name='Home'
              component={Tabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name='Playlist'
              component={PlaylistScreen}
              options={{ title: '', headerBackTitle: 'Back' }}
            />
          </Stack.Navigator>

          {/* Mini player sits above the tab bar, always visible */}
          <PlayerWrapper />
        </NavigationContainer>
        <StatusBar style='light' />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

// Separate component so it only re-renders when currentTrack changes
function PlayerWrapper() {
  const currentTrack  = useStore(s => s.currentTrack)
  const fullPlayerOpen = useStore(s => s.fullPlayerOpen)
  if (!currentTrack && !fullPlayerOpen) return null
  return <MiniPlayer />
}
