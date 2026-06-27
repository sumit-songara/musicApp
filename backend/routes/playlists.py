import os
import uuid
import shutil
from flask import Blueprint, jsonify, request
from database import get_db
from config import DOWNLOADS_DIR
from services.downloader import cancel_by_playlist, start_download

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


@bp.patch('/api/playlists/<int:pid>')
def rename_playlist(pid):
    data = request.json or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400
    with get_db() as conn:
        conn.execute('UPDATE playlists SET title=? WHERE id=?', (title, pid))
        pl = conn.execute('SELECT * FROM playlists WHERE id=?', (pid,)).fetchone()
    if not pl:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(dict(pl))


@bp.delete('/api/playlists/<int:pid>/tracks/<int:tid>')
def delete_track(pid, tid):
    with get_db() as conn:
        track = conn.execute(
            'SELECT * FROM tracks WHERE id=? AND playlist_id=?', (tid, pid)
        ).fetchone()
        if not track:
            return jsonify({'error': 'Not found'}), 404
        fp = track['file_path']
        conn.execute('DELETE FROM tracks WHERE id=?', (tid,))
        conn.execute(
            'UPDATE playlists SET '
            'track_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=?), '
            'downloaded_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=? AND is_downloaded=1) '
            'WHERE id=?',
            (pid, pid, pid),
        )

    if fp and os.path.isfile(fp):
        try:
            os.remove(fp)
        except OSError:
            pass

    return jsonify({'success': True})


@bp.post('/api/playlists/<int:pid>/tracks/<int:tid>/redownload')
def redownload_track(pid, tid):
    with get_db() as conn:
        track = conn.execute(
            'SELECT * FROM tracks WHERE id=? AND playlist_id=?', (tid, pid)
        ).fetchone()
        if not track:
            return jsonify({'error': 'Not found'}), 404

        source_url = track['source_url']
        if not source_url:
            return jsonify({'error': 'No source URL stored for this track'}), 400

        fp = track['file_path']
        if fp and os.path.isfile(fp):
            try:
                os.remove(fp)
            except OSError:
                pass

        conn.execute(
            'UPDATE tracks SET is_downloaded=0, file_path="" WHERE id=?', (tid,)
        )
        conn.execute(
            'UPDATE playlists SET status="downloading", '
            'downloaded_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=? AND is_downloaded=1) '
            'WHERE id=?',
            (pid, pid),
        )

    download_id = str(uuid.uuid4())
    start_download(source_url, download_id, pid, is_single=True)

    return jsonify({'download_id': download_id, 'playlist_id': pid})
