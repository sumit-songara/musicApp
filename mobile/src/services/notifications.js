import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

// v3 channel ID forces Android to recreate the channel with correct (silent) settings.
// Android caches channel config permanently — bumping the ID is the only way to reset it.
// LOW = no sound, no vibration, no heads-up popup, but icon visible in status bar.
const CH = 'ob-dl-v3'
const ID = 'ob-dl'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export async function setupNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CH, {
      name: 'Download Progress',
      importance: Notifications.AndroidImportance.LOW,  // silent, but visible in notification tray
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      showBadge: false,
    })
  }
  await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  }).catch(() => {})
}

// Only update when pct jumps by ≥10% AND title has changed — keeps updates to ~10 per song
// and prevents the notification from "flashing" on every small progress tick.
let _lastPct   = -1
let _lastTitle = ''

export async function postDownloadNotif({ title, current, total, pct }) {
  try {
    const pctInt   = Math.max(0, Math.min(100, Math.round((pct || 0) * 100)))
    const songName = (title || '…').slice(0, 45)

    const pctChanged   = Math.abs(pctInt - _lastPct) >= 10
    const titleChanged = songName !== _lastTitle

    // Always fire when song title changes (new track started), otherwise wait for 10% jump
    if (!titleChanged && !pctChanged) return

    _lastPct   = pctInt
    _lastTitle = songName

    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: {
        title: songName,
        body:  `Downloading ${current} of ${total}  ·  ${pctInt}%`,
        data:  {},
        ...(Platform.OS === 'android' && {
          android: {
            channelId:    CH,
            ongoing:      true,
            sticky:       true,
            color:        '#1DB954',
            smallIcon:    'notification_icon',
            progress:     { max: 100, current: pctInt, indeterminate: pctInt === 0 },
          },
        }),
      },
      trigger: null,
    })
  } catch {}
}

export async function postDoneNotif(count) {
  try {
    _lastPct   = -1
    _lastTitle = ''
    await clearDownloadNotif()
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✓ Download complete',
        body:  `${count} track${count !== 1 ? 's' : ''} saved`,
        data:  {},
        ...(Platform.OS === 'android' && { android: { channelId: CH, color: '#1DB954' } }),
      },
      trigger: null,
    })
  } catch {}
}

export async function clearDownloadNotif() {
  try {
    _lastPct   = -1
    _lastTitle = ''
    await Notifications.dismissNotificationAsync(ID)
  } catch {}
}
