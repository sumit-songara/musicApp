import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

const CH = 'ob-download'
const ID = 'ob-dl'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,  // don't pop up as a banner when app is in foreground
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export async function setupNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CH, {
      name: 'Download Progress',
      importance: Notifications.AndroidImportance.LOW,
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

export async function postDownloadNotif({ title, current, total, pct }) {
  try {
    const pctInt = Math.max(0, Math.min(100, Math.round((pct || 0) * 100)))
    const songName = (title || '…').slice(0, 45)
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: {
        title: songName,
        body:  `Downloading ${current} of ${total}  ·  ${pctInt}%`,
        data:  {},
        ...(Platform.OS === 'android' && {
          android: {
            channelId:  CH,
            ongoing:    true,
            sticky:     true,
            color:      '#1DB954',
            smallIcon:  'notification_icon',
            progress:   { max: 100, current: pctInt, indeterminate: pctInt === 0 },
          },
        }),
      },
      trigger: null,
    })
  } catch {}
}

export async function postDoneNotif(count) {
  try {
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
  try { await Notifications.dismissNotificationAsync(ID) } catch {}
}
