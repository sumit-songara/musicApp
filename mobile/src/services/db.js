import * as SQLite from 'expo-sqlite'

let _db = null

async function getDb() {
  if (_db) return _db
  _db = await SQLite.openDatabaseAsync('offlinebeats2.db')
  return _db
}

export async function initDb() {
  const db = await getDb()
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS playlists (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL DEFAULT 'youtube',
      url         TEXT NOT NULL DEFAULT '',
      thumbnail   TEXT DEFAULT '',
      track_count INTEGER DEFAULT 0,
      created_at  INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS tracks (
      id           TEXT PRIMARY KEY,
      playlist_id  TEXT NOT NULL,
      title        TEXT NOT NULL DEFAULT '',
      artist       TEXT DEFAULT 'Unknown',
      duration     INTEGER DEFAULT 0,
      file_path    TEXT DEFAULT '',
      thumbnail    TEXT DEFAULT '',
      is_downloaded INTEGER DEFAULT 0,
      position     INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_tracks_playlist ON tracks(playlist_id);
  `)
  // Idempotent migration: add sort_order for user-defined playlist ordering
  try { await db.execAsync('ALTER TABLE playlists ADD COLUMN sort_order INTEGER DEFAULT 0') } catch {}
}

export async function getSetting(key) {
  const db = await getDb()
  const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key])
  return row?.value ?? null
}

export async function saveSetting(key, value) {
  const db = await getDb()
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value ?? '']
  )
}

export async function savePlaylists(playlist) {
  const db = await getDb()
  await db.runAsync(
    `INSERT OR REPLACE INTO playlists (id, title, source, url, thumbnail, track_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      playlist.id,
      playlist.title || '',
      playlist.source || 'youtube',
      playlist.url || '',
      playlist.thumbnail || '',
      playlist.track_count || 0,
    ]
  )
}

export async function saveTrack(track) {
  const db = await getDb()
  await db.runAsync(
    `INSERT OR REPLACE INTO tracks
      (id, playlist_id, title, artist, duration, file_path, thumbnail, is_downloaded, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      track.id,
      track.playlist_id,
      track.title || '',
      track.artist || 'Unknown',
      track.duration || 0,
      track.file_path || '',
      track.thumbnail || '',
      track.is_downloaded ? 1 : 0,
      track.position || 0,
    ]
  )
}

export async function getPlaylists() {
  const db = await getDb()
  return db.getAllAsync(`
    SELECT p.*,
           COALESCE(SUM(CASE WHEN t.is_downloaded = 1 THEN 1 ELSE 0 END), 0) AS downloaded_count
    FROM playlists p
    LEFT JOIN tracks t ON t.playlist_id = p.id
    GROUP BY p.id
    ORDER BY p.sort_order ASC, p.created_at DESC
  `)
}

export async function updatePlaylistTitle(id, title) {
  const db = await getDb()
  await db.runAsync('UPDATE playlists SET title = ? WHERE id = ?', [title, id])
}

export async function updatePlaylistSortOrders(orderedIds) {
  const db = await getDb()
  for (let i = 0; i < orderedIds.length; i++) {
    await db.runAsync('UPDATE playlists SET sort_order = ? WHERE id = ?', [i, orderedIds[i]])
  }
}

export async function deleteTrackFromDb(trackId) {
  const db = await getDb()
  const track = await db.getFirstAsync(
    'SELECT file_path, playlist_id FROM tracks WHERE id = ?', [trackId]
  )
  if (!track) return null
  await db.runAsync('DELETE FROM tracks WHERE id = ?', [trackId])
  await db.runAsync(
    'UPDATE playlists SET track_count = (SELECT COUNT(*) FROM tracks WHERE playlist_id = ?) WHERE id = ?',
    [track.playlist_id, track.playlist_id]
  )
  return track.file_path || null
}

export async function getPlaylistWithTracks(id) {
  const db = await getDb()
  const playlist = await db.getFirstAsync('SELECT * FROM playlists WHERE id = ?', [id])
  if (!playlist) return null
  const tracks = await db.getAllAsync(
    'SELECT * FROM tracks WHERE playlist_id = ? ORDER BY position ASC',
    [id]
  )
  return { ...playlist, tracks: tracks || [] }
}

export async function deletePlaylistFromDb(id) {
  const db = await getDb()
  const tracks = await db.getAllAsync('SELECT file_path FROM tracks WHERE playlist_id = ?', [id])
  await db.runAsync('DELETE FROM tracks WHERE playlist_id = ?', [id])
  await db.runAsync('DELETE FROM playlists WHERE id = ?', [id])
  return (tracks || []).map(t => t.file_path).filter(Boolean)
}
