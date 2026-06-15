import os
from flask import Blueprint, jsonify, request
from database import get_db

bp = Blueprint('local', __name__)

AUDIO_EXTS = {'.mp3', '.flac', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.wma'}


def _read_metadata(path: str) -> dict:
    title = os.path.splitext(os.path.basename(path))[0]
    artist, album, duration = 'Unknown Artist', '', 0
    try:
        from mutagen import File
        audio = File(path, easy=True)
        if audio:
            title = str(audio.get('title', [title])[0])
            artist = str(audio.get('artist', ['Unknown Artist'])[0])
            album = str(audio.get('album', [''])[0])
            duration = int(audio.info.length) if hasattr(audio, 'info') else 0
    except Exception:
        pass
    return {'title': title, 'artist': artist, 'album': album, 'duration': duration}


@bp.post('/api/local/scan')
def scan():
    body = request.get_json(silent=True) or {}
    folder = os.path.expanduser((body.get('path') or '').strip())

    if not folder:
        return jsonify({'error': 'path is required'}), 400
    if not os.path.isdir(folder):
        return jsonify({'error': f'Folder not found: {folder}'}), 400

    # Collect all audio files recursively
    files = []
    for root, _, fnames in os.walk(folder):
        for fn in sorted(fnames):
            if os.path.splitext(fn)[1].lower() in AUDIO_EXTS:
                files.append(os.path.join(root, fn))

    if not files:
        return jsonify({'error': 'No audio files found in that folder'}), 404

    playlist_title = os.path.basename(folder.rstrip('/')) or 'Local Music'

    with get_db() as conn:
        # Check if already imported
        existing = conn.execute(
            'SELECT * FROM playlists WHERE url=?', (folder,)
        ).fetchone()

        if existing:
            # Re-sync: delete old tracks and reimport
            conn.execute('DELETE FROM tracks WHERE playlist_id=?', (existing['id'],))
            playlist_id = existing['id']
        else:
            cur = conn.execute(
                'INSERT INTO playlists (title, source, url, status, track_count, downloaded_count) '
                'VALUES (?, ?, ?, ?, ?, ?)',
                (playlist_title, 'local', folder, 'completed', len(files), len(files)),
            )
            playlist_id = cur.lastrowid

        for i, fp in enumerate(files):
            meta = _read_metadata(fp)
            conn.execute(
                '''INSERT INTO tracks
                   (playlist_id, title, artist, album, duration, file_path, is_downloaded, position)
                   VALUES (?, ?, ?, ?, ?, ?, 1, ?)''',
                (playlist_id, meta['title'], meta['artist'], meta['album'],
                 meta['duration'], fp, i),
            )

        conn.execute(
            'UPDATE playlists SET title=?, track_count=?, downloaded_count=?, status=? WHERE id=?',
            (playlist_title, len(files), len(files), 'completed', playlist_id),
        )

    return jsonify({'playlist_id': playlist_id, 'track_count': len(files)}), 201


@bp.get('/api/local/preview')
def preview():
    """Count audio files in a folder without importing."""
    folder = os.path.expanduser((request.args.get('path') or '').strip())
    if not folder or not os.path.isdir(folder):
        return jsonify({'count': 0, 'valid': False})

    count = sum(
        1
        for root, _, fnames in os.walk(folder)
        for fn in fnames
        if os.path.splitext(fn)[1].lower() in AUDIO_EXTS
    )
    return jsonify({'count': count, 'valid': True, 'folder': os.path.basename(folder)})
