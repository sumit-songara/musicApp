import os
import shutil
import subprocess
import tempfile
from flask import Blueprint, after_this_request, jsonify, send_file

bp = Blueprint('mobile', __name__)

_YTDLP = '/opt/homebrew/bin/yt-dlp'
_ENV   = {**os.environ, 'PATH': '/opt/homebrew/bin:' + os.environ.get('PATH', '')}


@bp.get('/api/mobile/ping')
def ping():
    return jsonify({'ok': True, 'service': 'OfflineBeats'})


@bp.get('/api/mobile/audio/<video_id>')
def audio(video_id):
    # Validate: YouTube video IDs are exactly 11 chars, alphanumeric + _ -
    if not video_id or len(video_id) != 11 or not all(c.isalnum() or c in '-_' for c in video_id):
        return jsonify({'error': 'invalid video id'}), 400

    tmp_dir = tempfile.mkdtemp(prefix='ob_mobile_')

    @after_this_request
    def cleanup(response):
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return response

    out_tmpl = os.path.join(tmp_dir, '%(id)s.%(ext)s')
    try:
        result = subprocess.run(
            [
                _YTDLP,
                '-f', '140/bestaudio[ext=m4a]/bestaudio/best',
                '-x', '--audio-format', 'm4a',
                '--audio-quality', '0',
                '--no-playlist',
                '--no-warnings',
                '-o', out_tmpl,
                f'https://www.youtube.com/watch?v={video_id}',
            ],
            timeout=180,
            capture_output=True,
            env=_ENV,
        )

        files = [f for f in os.listdir(tmp_dir) if not f.startswith('.')]
        if not files or result.returncode != 0:
            detail = result.stderr.decode(errors='replace')[-400:]
            return jsonify({'error': 'yt-dlp failed', 'detail': detail}), 500

        out_path = os.path.join(tmp_dir, files[0])
        return send_file(out_path, mimetype='audio/mp4', as_attachment=False)

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'download timed out'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500
