import { Alert, Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Notifications from 'expo-notifications'

// ── Config ────────────────────────────────────────────────────────────────────

export const APP_VERSION = '2.1.6'

const RELEASES_API =
  'https://api.github.com/repos/sumit-songara/musicApp/releases/latest'

// Separate silent channel for update progress (won't interfere with song downloads)
const UPDATE_CH = 'ob-update-v1'
const UPDATE_ID = 'ob-update'

// ── Version comparison ────────────────────────────────────────────────────────

function parseVer(v) {
  return String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
}

function isNewer(remote, local) {
  const r = parseVer(remote)
  const l = parseVer(local)
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true
    if (r[i] < l[i]) return false
  }
  return false
}

// ── Progress notification helpers ─────────────────────────────────────────────

async function ensureUpdateChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(UPDATE_CH, {
    name: 'App Update',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
    showBadge: false,
  }).catch(() => {})
}

let _lastPct = -1

async function postUpdateProgress(pct) {
  if (Math.abs(pct - _lastPct) < 2) return   // skip tiny changes
  _lastPct = pct
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: UPDATE_ID,
      content: {
        title: 'Downloading OfflineBeats update…',
        body: `${pct}% — please wait`,
        data: {},
        ...(Platform.OS === 'android' && {
          android: {
            channelId:    UPDATE_CH,
            ongoing:      true,
            sticky:       true,
            color:        '#1DB954',
            smallIcon:    'notification_icon',
            progress:     { max: 100, current: pct, indeterminate: pct === 0 },
          },
        }),
      },
      trigger: null,
    })
  } catch {}
}

async function clearUpdateNotif() {
  _lastPct = -1
  try { await Notifications.dismissNotificationAsync(UPDATE_ID) } catch {}
}

async function postUpdateDone() {
  _lastPct = -1
  try {
    await Notifications.dismissNotificationAsync(UPDATE_ID)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✓ Update downloaded',
        body: 'Follow the on-screen steps to finish installing.',
        data: {},
        ...(Platform.OS === 'android' && {
          android: { channelId: UPDATE_CH, color: '#1DB954' },
        }),
      },
      trigger: null,
    })
  } catch {}
}

// ── Public: call this once on app startup ─────────────────────────────────────

export async function checkForUpdate() {
  if (Platform.OS !== 'android') return
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!res.ok) return
    const release = await res.json()

    const remoteVersion = release.tag_name
    if (!remoteVersion || !isNewer(remoteVersion, APP_VERSION)) return

    const apkAsset = (release.assets || []).find(a =>
      a.name.toLowerCase().endsWith('.apk'),
    )
    if (!apkAsset?.browser_download_url) return

    const notes = (release.body || '').trim()

    Alert.alert(
      `Update available — ${remoteVersion}`,
      notes
        ? `What's new:\n${notes}`
        : 'A new version of OfflineBeats is ready to install.',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Update now',
          onPress: () => downloadAndInstall(apkAsset.browser_download_url, remoteVersion),
        },
      ],
      { cancelable: true },
    )
  } catch {
    // No network or repo not yet created — silently ignore
  }
}

// ── Download + launch Android installer ──────────────────────────────────────

let _downloading = false

async function downloadAndInstall(apkUrl, version) {
  if (_downloading) return
  _downloading = true

  await ensureUpdateChannel()
  await postUpdateProgress(0)   // show "0%" immediately so user sees feedback

  const dest = FileSystem.cacheDirectory + `offlinebeats-${version}.apk`

  try {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {})

    const dl = FileSystem.createDownloadResumable(
      apkUrl,
      dest,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        if (totalBytesExpectedToWrite > 0) {
          const pct = Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
          postUpdateProgress(pct)
        }
      },
    )

    const result = await dl.downloadAsync()
    if (!result?.uri) throw new Error('Download returned no URI')

    const info = await FileSystem.getInfoAsync(result.uri, { size: true })
    if (!info.exists || (info.size || 0) < 100_000) {
      throw new Error('Downloaded file is too small — check the release APK asset.')
    }

    await postUpdateDone()

    const contentUri = await FileSystem.getContentUriAsync(result.uri)
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: 'application/vnd.android.package-archive',
    })
  } catch (e) {
    await clearUpdateNotif()
    Alert.alert(
      'Update failed',
      `Could not install the update:\n${e.message}\n\nTry again later.`,
    )
  } finally {
    _downloading = false
  }
}
