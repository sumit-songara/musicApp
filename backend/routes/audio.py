import os
from flask import Blueprint, abort, send_file
from database import get_db
from config import DOWNLOADS_DIR

bp = Blueprint('audio', __name__)


@bp.get('/api/audio/<int:track_id>')
def serve(track_id: int):
    with get_db() as conn:
        track = conn.execute('SELECT * FROM tracks WHERE id=?', (track_id,)).fetchone()

    if not track:
        abort(404)

    fp = track['file_path']
    if not fp or not os.path.isfile(fp):
        abort(404)

    return send_file(fp, mimetype='audio/mpeg', conditional=True)


@bp.get('/api/thumbnail/<int:track_id>')
def thumbnail(track_id: int):
    with get_db() as conn:
        track = conn.execute('SELECT thumbnail FROM tracks WHERE id=?', (track_id,)).fetchone()

    if not track or not track['thumbnail']:
        abort(404)

    thumb_url = track['thumbnail']
    # Return remote URL for the frontend to use directly
    return {'url': thumb_url}


@bp.get('/api/cover/<int:playlist_id>/<path:filename>')
def serve_cover(playlist_id: int, filename: str):
    """Serve locally extracted album art for Spotify tracks."""
    cover_path = os.path.join(DOWNLOADS_DIR, str(playlist_id), 'covers', filename)
    if not os.path.isfile(cover_path):
        abort(404)
    mimetype = 'image/png' if filename.endswith('.png') else 'image/jpeg'
    return send_file(cover_path, mimetype=mimetype)
