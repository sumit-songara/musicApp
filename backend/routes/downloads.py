import json
import time
import uuid
from flask import Blueprint, jsonify, request, Response, stream_with_context
from database import get_db
from services.downloader import detect_source, start_download, peek_events

bp = Blueprint('downloads', __name__)

_active: dict[str, str] = {}  # download_id -> status

LIKED_SONGS_URL = '__liked_songs__'


@bp.post('/api/download')
def start():
    body = request.get_json(silent=True) or {}
    url = (body.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'url is required'}), 400

    try:
        source = detect_source(url)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    with get_db() as conn:
        existing = conn.execute('SELECT * FROM playlists WHERE url=?', (url,)).fetchone()
        if existing:
            return jsonify({'error': 'Playlist already added', 'playlist_id': existing['id']}), 409

        cur = conn.execute(
            'INSERT INTO playlists (title, source, url, status) VALUES (?, ?, ?, ?)',
            (f'Loading {source} playlist…', source, url, 'downloading'),
        )
        playlist_id = cur.lastrowid

    download_id = str(uuid.uuid4())
    _active[download_id] = 'running'
    start_download(url, download_id, playlist_id)

    return jsonify({'download_id': download_id, 'playlist_id': playlist_id}), 202


@bp.post('/api/download/single')
def add_single():
    body = request.get_json(silent=True) or {}
    url = (body.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'url is required'}), 400

    try:
        source = detect_source(url)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    with get_db() as conn:
        pl = conn.execute('SELECT * FROM playlists WHERE url=?', (LIKED_SONGS_URL,)).fetchone()
        if pl:
            playlist_id = pl['id']
        else:
            cur = conn.execute(
                'INSERT INTO playlists (title, source, url, status) VALUES (?, ?, ?, ?)',
                ('Liked Songs', source, LIKED_SONGS_URL, 'completed'),
            )
            playlist_id = cur.lastrowid

        conn.execute("UPDATE playlists SET status='downloading' WHERE id=?", (playlist_id,))

    download_id = str(uuid.uuid4())
    _active[download_id] = 'running'
    start_download(url, download_id, playlist_id, is_single=True)

    return jsonify({'download_id': download_id, 'playlist_id': playlist_id}), 202


@bp.get('/api/download/progress/<download_id>')
def progress(download_id: str):
    def generate():
        while True:
            events = peek_events(download_id)
            for ev in events:
                yield f'data: {json.dumps(ev)}\n\n'
                if ev.get('type') == 'done':
                    _active.pop(download_id, None)
                    return
            if not events:
                yield ': ping\n\n'
            time.sleep(0.5)

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )
