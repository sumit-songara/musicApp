import * as FileSystem from 'expo-file-system'

const MUSIC_DIR = FileSystem.documentDirectory + 'music/'

// ── Instance lists ────────────────────────────────────────────────────────────

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.projectsegfau.lt',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.syncpundit.io',
  'https://watchapi.whatever.social',
  'https://pipedapi.tokhmi.xyz',
]

// Instances that support the /latest_version proxy (critical for mobile downloads)
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.privacydev.net',
  'https://yt.cdaut.de',
  'https://iv.datura.network',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.fdn.fr',
  'https://inv.riverside.rocks',
  'https://invidious.tiekoetter.com',
  'https://invidious.private.coffee',
  'https://invidious.io',
  'https://inv.tux.pizza',
  'https://invidious.lunar.icu',
  'https://invidious.slipfox.xyz',
]

let _workingPiped = null
let _workingInv   = null

export async function ensureMusicDir() {
  const info = await FileSystem.getInfoAsync(MUSIC_DIR)
  if (!info.exists) await FileSystem.makeDirectoryAsync(MUSIC_DIR, { intermediates: true })
}

export function detectSource(url) {
  const u = (url || '').toLowerCase()
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('spotify.com')) return 'spotify'
  throw new Error('Paste a YouTube (youtube.com/playlist?list=…) or Spotify (open.spotify.com/playlist/…) URL')
}

function sanitize(s) {
  return (s || 'track').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 55) || 'track'
}

function ytPlaylistId(url) {
  const m = url.match(/[?&]list=([^&#]+)/)
  return m ? m[1] : null
}

function spotifyPlaylistId(url) {
  const m = url.match(/playlist\/([a-zA-Z0-9]+)/)
  return m ? m[1] : null
}

async function fetchJSON(url, options = {}, timeoutMs = 30000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

// ── YouTube direct extractor (ANDROID_VR client) ─────────────────────────────
// Fetches visitor_data from YouTube, then calls the internal player API with the
// ANDROID_VR client. The URLs returned are IP-signed for the REQUESTING device,
// so downloading from the same device works without any proxy.

let _ytVisitorData = null

async function refreshYouTubeVisitorData() {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch('https://www.youtube.com/', {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    clearTimeout(t)
    const html = await res.text()
    const m = html.match(/"VISITOR_DATA":"([^"]+)"/)
    _ytVisitorData = m ? m[1] : ''
    return _ytVisitorData
  } catch {
    clearTimeout(t)
    return _ytVisitorData || ''
  }
}

async function getYouTubeDirectUrl(videoId) {
  if (!_ytVisitorData) await refreshYouTubeVisitorData()

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-YouTube-Client-Name': '28',
        'X-YouTube-Client-Version': '1.56.21',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.56.21',
            deviceMake: 'Oculus',
            deviceModel: 'Quest 3',
            androidSdkVersion: 32,
            hl: 'en',
            gl: 'US',
            visitorData: _ytVisitorData || '',
          },
        },
      }),
    })
    clearTimeout(t)
    const data = await res.json()

    // Bot check → refresh visitor_data and retry once
    if (data.playabilityStatus?.status === 'LOGIN_REQUIRED') {
      _ytVisitorData = null
      await refreshYouTubeVisitorData()
      throw new Error('LOGIN_REQUIRED — will retry with fresh visitor_data')
    }

    const sd = data.streamingData
    if (!sd) throw new Error('No streamingData in player response')

    const formats = [...(sd.adaptiveFormats || []), ...(sd.formats || [])]
    const audio = formats
      .filter(f => f.mimeType?.startsWith('audio/') && f.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))

    if (!audio.length) throw new Error('No direct audio streams')

    // Prefer m4a (itag 140) for widest compatibility
    const m4a = audio.find(f => f.mimeType?.includes('mp4'))
    const best = m4a || audio[0]
    return {
      url: best.url,
      ext: best.mimeType?.includes('mp4') ? 'm4a' : 'webm',
    }
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

// ── ANDROID_VR with forced content-check bypass (Strategy B) ─────────────────
// Same client as Strategy A but with a freshly fetched visitor_data and the
// contentCheckOk/racyCheckOk flags that bypass age/content gate checks.
// Used as a retry when Strategy A's cached URL is stale or bot-flagged.

async function getYouTubeDirectUrlFresh(videoId) {
  // Always fetch a brand-new visitor token (don't reuse the cached one)
  const freshVisitor = await refreshYouTubeVisitorData()

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-YouTube-Client-Name': '28',
        'X-YouTube-Client-Version': '1.56.21',
      },
      body: JSON.stringify({
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.56.21',
            deviceMake: 'Oculus',
            deviceModel: 'Quest 3',
            androidSdkVersion: 32,
            hl: 'en',
            gl: 'US',
            visitorData: freshVisitor || '',
          },
        },
      }),
    })
    clearTimeout(t)
    const data = await res.json()
    if (data.playabilityStatus?.status === 'LOGIN_REQUIRED') throw new Error('LOGIN_REQUIRED')
    const sd = data.streamingData
    if (!sd) throw new Error('No streamingData')
    const formats = [...(sd.adaptiveFormats || []), ...(sd.formats || [])]
    const audio = formats
      .filter(f => f.mimeType?.startsWith('audio/') && f.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
    if (!audio.length) throw new Error('No audio streams')
    const m4a = audio.find(f => f.mimeType?.includes('mp4'))
    const best = m4a || audio[0]
    return { url: best.url, ext: best.mimeType?.includes('mp4') ? 'm4a' : 'webm' }
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

// ── Invidious — metadata + itag only (we NEVER use the direct CDN URL) ────────
//
// YouTube CDN URLs (googlevideo.com) returned by Piped/Invidious are signed for
// the proxy server's IP address. Downloading them directly from a mobile device
// always returns 403. We get the itag and then fetch via the /latest_version
// proxy endpoint instead, which routes the bytes through the Invidious server.

async function invFetch(path, timeoutMs = 25000) {
  const headers = { 'User-Agent': 'OfflineBeats/3', 'Accept': 'application/json' }
  if (_workingInv) {
    try {
      return await fetchJSON(`${_workingInv}/api/v1${path}`, { headers }, timeoutMs)
    } catch { _workingInv = null }
  }
  // Race batches of 5 — return as soon as any single instance responds
  for (let i = 0; i < INVIDIOUS.length; i += 5) {
    const batch = INVIDIOUS.slice(i, i + 5)
    try {
      const result = await Promise.any(
        batch.map(async base => {
          const data = await fetchJSON(`${base}/api/v1${path}`, { headers }, 15000)
          return { base, data }
        }),
      )
      _workingInv = result.base
      return result.data
    } catch { /* all in this batch failed, try next */ }
  }
  throw new Error('No YouTube proxy responded. Check your internet connection.')
}

async function getInvidiousMeta(videoId) {
  const data = await invFetch(
    `/videos/${videoId}?fields=adaptiveFormats,title,author,lengthSeconds,videoThumbnails`,
  )
  const fmts = (data.adaptiveFormats || [])
    .filter(f => (f.type || '').startsWith('audio/'))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
  if (!fmts.length) throw new Error('No audio streams found')
  const m4aFmt = fmts.find(f => (f.type || '').includes('mp4') || (f.type || '').includes('m4a'))
  const fmt    = m4aFmt || fmts[0]
  const thumb  = (data.videoThumbnails || []).find(t => t.quality === 'medium')?.url || null
  return {
    itag:      fmt.itag,
    ext:       m4aFmt ? 'm4a' : 'webm',
    title:     data.title         || null,
    artist:    data.author        || null,
    duration:  data.lengthSeconds || 0,
    thumbnail: thumb,
  }
}

// Download via Invidious /latest_version proxy — bytes flow through their server
async function downloadViaProxy(videoId, itag, dest, onProgress, resumableRef) {
  const instances = _workingInv
    ? [_workingInv, ...INVIDIOUS.filter(b => b !== _workingInv)]
    : INVIDIOUS
  for (const base of instances) {
    const proxyUrl = `${base}/latest_version?id=${videoId}&itag=${itag}&local=true`
    const uri = await tryDownload(proxyUrl, dest, onProgress, resumableRef, 1)
    if (uri) return uri
  }
  return null
}

// ── Piped — used for search only ──────────────────────────────────────────────

async function pipedGet(path) {
  if (_workingPiped) {
    try {
      const data = await fetchJSON(`${_workingPiped}${path}`)
      return { data, base: _workingPiped }
    } catch { _workingPiped = null }
  }
  for (const base of PIPED) {
    try {
      const data = await fetchJSON(`${base}${path}`)
      _workingPiped = base
      return { data, base }
    } catch { /* try next */ }
  }
  throw new Error('No Piped instance responded')
}

// ── YouTube oEmbed metadata ───────────────────────────────────────────────────

async function getYTMeta(videoId) {
  try {
    const data = await fetchJSON(
      `https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`,
      {},
      12000,
    )
    return {
      title:     data.title       || null,
      artist:    data.author_name || null,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    }
  } catch {
    return { title: null, artist: null, thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` }
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

// Primary: YouTube InnerTube WEB search — no third-party instances, always works
async function searchYTInnerTube(query) {
  if (!_ytVisitorData) await refreshYouTubeVisitorData()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US', visitorData: _ytVisitorData || '' } },
      }),
    })
    clearTimeout(t)
    const data = await res.json()
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
    for (const section of sections) {
      for (const item of (section?.itemSectionRenderer?.contents || [])) {
        const vid = item?.videoRenderer?.videoId
        if (vid && vid.length === 11) return vid
      }
    }
  } catch { clearTimeout(t) }
  return null
}

async function searchYT(query) {
  // Primary: YouTube InnerTube (no external instances needed)
  const vid = await searchYTInnerTube(query).catch(() => null)
  if (vid) return vid

  // Fallback: Piped (often dead but try anyway)
  try {
    const { data } = await pipedGet(`/search?q=${encodeURIComponent(query)}&filter=music_songs`)
    const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : [])
    for (const item of items) {
      if (item.url) {
        const m = item.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
        if (m) return m[1]
      }
    }
  } catch {}

  // Last resort: Invidious search (often 403 but try)
  try {
    const res = await invFetch(`/search?q=${encodeURIComponent(query)}&type=video&fields=videoId`)
    if (Array.isArray(res) && res.length) return res[0].videoId
  } catch {}

  throw new Error(`No YouTube result for: ${query}`)
}

// ── File download ─────────────────────────────────────────────────────────────

async function tryDownload(url, dest, onProgress, resumableRef, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {})
      const dl = FileSystem.createDownloadResumable(
        url,
        dest,
        // Headers matching the ANDROID_VR fetch — some WiFi proxies/firewalls
        // reject bare download requests without a recognisable User-Agent.
        {
          headers: {
            'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate',
          },
        },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          const pct = totalBytesExpectedToWrite > 0
            ? totalBytesWritten / totalBytesExpectedToWrite
            : 0
          onProgress?.({ pct, writtenBytes: totalBytesWritten, totalBytes: totalBytesExpectedToWrite })
        },
      )
      if (resumableRef) resumableRef.current = dl
      const result = await dl.downloadAsync()
      if (resumableRef) resumableRef.current = null
      console.log('[DL] result status:', result?.status, 'uri:', result?.uri ? 'ok' : 'null')
      if (!result?.uri) continue
      if (result.status && result.status !== 200 && result.status !== 206) {
        console.log('[DL] bad status', result.status, '— deleting')
        await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {})
        continue
      }
      const info = await FileSystem.getInfoAsync(result.uri, { size: true })
      console.log('[DL] file size:', info?.size)
      if (!info.exists || (info.size || 0) < 10000) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {})
        continue
      }
      return result.uri
    } catch (e) { console.log('[DL] download threw:', e?.message?.slice(0, 80)) }
  }
  return null
}

// ── Public: playlist fetching ─────────────────────────────────────────────────

function decodeHtmlEntities(str) {
  return (str || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").trim()
}

export async function fetchYouTubePlaylist(url) {
  const id = ytPlaylistId(url)
  if (!id) throw new Error('No playlist ID found. URL must contain ?list=…')

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  let xml
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`, {
      signal:  ctrl.signal,
      headers: { 'Accept': 'application/xml, text/xml, */*' },
    })
    clearTimeout(t)
    if (!res.ok) throw new Error(`YouTube returned ${res.status}`)
    xml = await res.text()
  } catch (e) {
    clearTimeout(t)
    throw new Error(`Could not load playlist. Make sure it is public and the URL is correct.\n${e.message}`)
  }

  const feedPart  = xml.split('<entry>')[0]
  const rawTitle  = feedPart.match(/<title>([^<]*)<\/title>/)?.[1] || 'YouTube Playlist'
  const entries   = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1])
  if (!entries.length) throw new Error('Playlist is empty or private')

  const tracks = entries.map((entry, i) => {
    const videoId   = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] || ''
    const title     = decodeHtmlEntities(entry.match(/<title>([^<]*)<\/title>/)?.[1])
    const artist    = decodeHtmlEntities(entry.match(/<name>([^<]*)<\/name>/)?.[1])
    const thumbnail = entry.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1]
      || (videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '')
    return { id: videoId, title: title || 'Unknown', artist: artist || 'Unknown', duration: 0, thumbnail, position: i }
  })

  return {
    title:     decodeHtmlEntities(rawTitle) || 'YouTube Playlist',
    thumbnail: tracks[0]?.thumbnail || '',
    source:    'youtube',
    tracks,
  }
}

export async function fetchSpotifyPlaylist(url) {
  const id = spotifyPlaylistId(url)
  if (!id) throw new Error('No Spotify playlist ID found in that URL')
  let html
  try {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 15000)
    const res = await fetch(`https://open.spotify.com/embed/playlist/${id}`, {
      signal:  ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Accept:       'text/html',
      },
    })
    if (!res.ok) throw new Error(`Spotify returned ${res.status}`)
    html = await res.text()
  } catch (e) { throw new Error(`Couldn't load Spotify playlist: ${e.message}`) }

  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('Could not parse Spotify page. Playlist may be private.')
  let data
  try { data = JSON.parse(match[1]) } catch { throw new Error('Spotify page changed format. Try again.') }
  const entity = data?.props?.pageProps?.state?.data?.entity
  if (!entity) throw new Error('Playlist not found or private')
  const tracks = entity.trackList || []
  if (!tracks.length) throw new Error('Spotify playlist is empty')
  return {
    title:     entity.name || 'Spotify Playlist',
    // Spotify embed uses coverArt.sources, not images
    thumbnail: entity.coverArt?.sources?.[0]?.url || '',
    source:    'spotify',
    tracks:    tracks.map((t, i) => ({
      id:            null,
      spotifyTitle:  t.title    || 'Unknown',
      spotifyArtist: t.subtitle || 'Unknown',
      title:         t.title    || 'Unknown',
      artist:        t.subtitle || 'Unknown',
      duration:      Math.round((t.duration || 0) / 1000),
      // Spotify embed tracks have no imageUrl; thumbnail is set from YouTube CDN after download
      thumbnail:     '',
      position:      i,
    })),
  }
}

// ── Public: download one track ────────────────────────────────────────────────
// onMetaResolved(meta) fires as soon as videoId + metadata are known, before the
// actual file download completes — lets the caller save the thumbnail early.

export async function downloadTrack(track, playlistId, onProgress, resumableRef, onMetaResolved) {
  await ensureMusicDir()

  // ── 1. Resolve video ID (Spotify tracks need a YouTube search) ────────────
  let videoId = track.id
  if (!videoId || videoId.length !== 11) {
    const q = `${track.spotifyArtist || track.artist || ''} ${track.spotifyTitle || track.title || ''} official audio`
    videoId = await searchYT(q)
  }

  // ── 2. Start URL resolution AND metadata fetching all in parallel ──────────
  // Strategy A: ANDROID_VR with cached visitor_data (fast path)
  // Strategy B (round 2 only): ANDROID_VR with fresh visitor_data + content flags
  const ytUrlP   = getYouTubeDirectUrl(videoId).catch(() => null)
  const invMetaP = getInvidiousMeta(videoId).catch(() => null)
  const ytMetaP  = getYTMeta(videoId)  // never rejects, fast ~500ms

  const [invMeta, ytMeta] = await Promise.all([invMetaP, ytMetaP])

  // ── 3. Metadata ────────────────────────────────────────────────────────────
  const title     = invMeta?.title    || ytMeta?.title    || track.spotifyTitle  || track.title  || 'Unknown'
  const artist    = invMeta?.artist   || ytMeta?.artist   || track.spotifyArtist || track.artist || 'Unknown'
  const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
  const duration  = invMeta?.duration || track.duration   || 0
  const ext       = invMeta?.ext      || 'm4a'

  // Fire early so caller can persist thumbnail + resolved title before download
  try { onMetaResolved?.({ videoId, title, artist, thumbnail, duration }) } catch {}

  const basePrefix = `${playlistId.slice(0, 8)}_${sanitize(title)}`
  let dest = MUSIC_DIR + `${basePrefix}.${ext}`

  // Skip if already downloaded
  const existing = await FileSystem.getInfoAsync(dest, { size: true })
  if (existing.exists && (existing.size || 0) > 10000) {
    onProgress?.({ pct: 1, writtenBytes: existing.size, totalBytes: existing.size })
    return { ...track, file_path: dest, title, artist, thumbnail, duration }
  }

  // ── 4. Download — sequential attempts, URL fetches overlap to save time ──────
  // Strategy A (ANDROID_VR) and B (iOS) URLs were already fetched in parallel
  // above. We try downloading them one at a time to avoid double-bandwidth.
  // If both cached URLs fail (expired CDN token), we fetch fresh ones and retry.

  let uri = null

  async function attemptDownload(sourceP) {
    const source = await sourceP
    if (!source?.url) return
    const d = MUSIC_DIR + `${basePrefix}.${source.ext || ext}`
    const result = await tryDownload(source.url, d, onProgress, resumableRef, 1)
    if (result) { uri = result; dest = d }
  }

  // Round 1: Strategy A (ANDROID_VR with cached visitor_data, already in flight)
  await attemptDownload(ytUrlP)

  // Round 2: Strategy B — fresh visitor_data + contentCheckOk flags (bypasses bot/content flags)
  if (!uri) await attemptDownload(getYouTubeDirectUrlFresh(videoId).catch(() => null))

  // Round 3: one more Strategy A retry with refreshed visitor data
  if (!uri) await attemptDownload(getYouTubeDirectUrl(videoId).catch(() => null))

  if (!uri) {
    throw new Error(`Could not download "${title}". Check your internet connection and try again.`)
  }

  return { ...track, file_path: uri, title, artist, thumbnail, duration }
}
