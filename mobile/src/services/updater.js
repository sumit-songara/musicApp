import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import Constants from 'expo-constants'

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0'

const RELEASES_API =
  'https://api.github.com/repos/sumit-songara/musicApp/releases/latest'

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

// Returns { version, apkUrl, notes } if an update is available, otherwise null.
export async function checkForUpdate() {
  if (Platform.OS !== 'android') return null
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!res.ok) return null
    const release = await res.json()

    const remoteVersion = release.tag_name
    if (!remoteVersion || !isNewer(remoteVersion, APP_VERSION)) return null

    const apkAsset = (release.assets || []).find(a =>
      a.name.toLowerCase().endsWith('.apk'),
    )
    if (!apkAsset?.browser_download_url) return null

    return {
      version: remoteVersion,
      apkUrl:  apkAsset.browser_download_url,
      notes:   (release.body || '').trim(),
    }
  } catch {
    return null
  }
}

// Downloads the APK. Calls onProgress(0–100) as bytes arrive. Returns local URI.
export async function downloadApk(apkUrl, onProgress) {
  const dest = FileSystem.cacheDirectory + 'offlinebeats-update.apk'
  await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {})

  const dl = FileSystem.createDownloadResumable(
    apkUrl,
    dest,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) {
        const pct = Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
        onProgress?.(pct)
      }
    },
  )

  const result = await dl.downloadAsync()
  if (!result?.uri) throw new Error('Download returned no URI.')

  const info = await FileSystem.getInfoAsync(result.uri, { size: true })
  if (!info.exists || (info.size || 0) < 100_000)
    throw new Error('Downloaded file is too small — the APK may not be published yet.')

  return result.uri
}

// Launches the Android package installer for the given local APK URI.
export async function installApk(localUri) {
  const contentUri = await FileSystem.getContentUriAsync(localUri)
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data:  contentUri,
    flags: 1,
    type:  'application/vnd.android.package-archive',
  })
}
