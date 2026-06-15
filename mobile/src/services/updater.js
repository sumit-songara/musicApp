import { Alert, Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'

// ── Config ────────────────────────────────────────────────────────────────────
// Bump APP_VERSION every release. Tag the GitHub release with the same string
// (e.g. "v2.1.0"). The checker compares this against the latest GitHub tag.

export const APP_VERSION = '2.1.0'

const RELEASES_API =
  'https://api.github.com/repos/sumit-songara/musicApp/releases/latest'

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

// ── Public: call this once on app startup ─────────────────────────────────────

export async function checkForUpdate() {
  if (Platform.OS !== 'android') return   // only self-update on Android
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!res.ok) return
    const release = await res.json()

    const remoteVersion = release.tag_name  // e.g. "v2.2.0"
    if (!remoteVersion || !isNewer(remoteVersion, APP_VERSION)) return

    // Find the .apk asset in the release
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

let _downloading = false   // prevent double-taps

async function downloadAndInstall(apkUrl, version) {
  if (_downloading) return
  _downloading = true

  const dest = FileSystem.cacheDirectory + `offlinebeats-${version}.apk`

  try {
    // Remove any stale file first
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {})

    Alert.alert(
      'Downloading update…',
      'This may take a moment. You will be prompted to install once complete.',
    )

    const dl = FileSystem.createDownloadResumable(apkUrl, dest, {})
    const result = await dl.downloadAsync()
    if (!result?.uri) throw new Error('Download returned no URI')

    const info = await FileSystem.getInfoAsync(result.uri, { size: true })
    if (!info.exists || (info.size || 0) < 100_000) {
      throw new Error('Downloaded file is too small — check the release APK asset.')
    }

    // expo-file-system's FileSystemFileProvider converts the file:// path
    // to a content:// URI that the Android package installer accepts
    const contentUri = await FileSystem.getContentUriAsync(result.uri)

    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,   // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    })
  } catch (e) {
    Alert.alert(
      'Update failed',
      `Could not install the update:\n${e.message}\n\nTry again later.`,
    )
  } finally {
    _downloading = false
  }
}
