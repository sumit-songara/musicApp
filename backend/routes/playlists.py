import os
import shutil
from flask import Blueprint, jsonify, request
from database import get_db
from config import DOWNLOADS_DIR
from services.downloader import cancel_by_playlist

bp = Blueprint('playlists', __name__)


@bp.get('/api/playlists')
def list_playlists():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM playlists ORDER BY created_at DESC').fetchall()
    return jsonify([dict(r) for r in rows])


@bp.get('/api/playlists/<int:pid>')
def get_playlist(pid):
    with get_db() as conn:
        pl = conn.execute('SELECT * FROM playlists WHERE id=?', (pid,)).fetchone()
        if not pl:
            return jsonify({'error': 'Not found'}), 404
        tracks = conn.execute(
            'SELECT * FROM tracks WHERE playlist_id=? ORDER BY position', (pid,)
        ).fetchall()
    data = dict(pl)
    data['tracks'] = [dict(t) for t in tracks]
    return jsonify(data)


@bp.post('/api/playlists/<int:pid>/stop')
def stop_playlist(pid):
    cancel_by_playlist(pid)

    with get_db() as conn:
        pl = conn.execute('SELECT * FROM playlists WHERE id=?', (pid,)).fetchone()
        if not pl:
            return jsonify({'error': 'Not found'}), 404
        conn.execute(
            '''UPDATE playlists SET status='stopped',
               downloaded_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=? AND is_downloaded=1),
               track_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=?)
               WHERE id=?''',
            (pid, pid, pid),
        )
        pl = conn.execute('SELECT * FROM playlists WHERE id=?', (pid,)).fetchone()
        tracks = conn.execute('SELECT * FROM tracks WHERE playlist_id=? ORDER BY position', (pid,)).fetchall()

    data = dict(pl)
    data['tracks'] = [dict(t) for t in tracks]
    return jsonify(data)


@bp.delete('/api/playlists/<int:pid>')
def delete_playlist(pid):
    cancel_by_playlist(pid)

    with get_db() as conn:
        pl = conn.execute('SELECT * FROM playlists WHERE id=?', (pid,)).fetchone()
        if not pl:
            return jsonify({'error': 'Not found'}), 404
        tracks = conn.execute('SELECT file_path FROM tracks WHERE playlist_id=?', (pid,)).fetchall()
        conn.execute('DELETE FROM playlists WHERE id=?', (pid,))

    # Delete individual track files (handles local imports and any stray paths)
    for t in tracks:
        fp = t['file_path']
        if fp and os.path.isfile(fp):
            try:
                os.remove(fp)
            except OSError:
                pass

    # Delete the whole playlist directory (handles downloaded playlists)
    playlist_dir = os.path.join(DOWNLOADS_DIR, str(pid))
    if os.path.exists(playlist_dir):
        shutil.rmtree(playlist_dir)

    return jsonify({'success': True})
