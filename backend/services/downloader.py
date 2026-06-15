import os
import threading
from config import DOWNLOADS_DIR

_progress: dict[str, list] = {}
_lock = threading.Lock()

_cancel_flags: dict[str, threading.Event] = {}   # download_id -> Event
_active_procs: dict[str, object] = {}             # download_id -> Popen
_playlist_download_map: dict[int, str] = {}       # playlist_id -> download_id

# Add Homebrew Python 3.11 bin (where spotdl/yt-dlp are installed) to PATH
_HOMEBREW_BIN = '/opt/homebrew/bin'
_PY311_BIN = '/opt/homebrew/opt/python@3.11/bin'
for _p in (_HOMEBREW_BIN, _PY311_BIN):
    if _p not in os.environ.get('PATH', ''):
        os.environ['PATH'] = _p + os.pathsep + os.environ.get('PATH', '')


def detect_source(url: str) -> str:
    if 'youtube.com' in url or 'youtu.be' in url:
        return 'youtube'
    if 'spotify.com' in url:
        return 'spotify'
    raise ValueError('Unsupported URL. Use a YouTube or Spotify playlist link.')


def push_event(download_id: str, event: dict):
    with _lock:
        _progress.setdefault(download_id, []).append(event)


def flush_events(download_id: str) -> list:
    with _lock:
        events = _progress.pop(download_id, [])
    return events


def peek_events(download_id: str) -> list:
    with _lock:
        events = list(_progress.get(download_id, []))
        _progress[download_id] = []
    return events


def cancel_by_playlist(playlist_id: int):
    """Signal any active download for this playlist to stop and kill its subprocess."""
    with _lock:
        download_id = _playlist_download_map.get(playlist_id)
        if not download_id:
            return
        flag = _cancel_flags.get(download_id)
        if flag:
            flag.set()
        proc = _active_procs.get(download_id)
        if proc:
            try:
                proc.terminate()
            except Exception:
                pass


def start_download(url: str, download_id: str, playlist_id: int, is_single: bool = False):
    source = detect_source(url)
    cancel_event = threading.Event()
    with _lock:
        _cancel_flags[download_id] = cancel_event
        _playlist_download_map[playlist_id] = download_id
    t = threading.Thread(
        target=_worker,
        args=(url, source, download_id, playlist_id, is_single, cancel_event),
        daemon=True,
    )
    t.start()


def _worker(url: str, source: str, download_id: str, playlist_id: int, is_single: bool = False,
            cancel_event: threading.Event = None):
    if cancel_event is None:
        cancel_event = threading.Event()
    try:
        if source == 'youtube':
            _download_youtube(url, download_id, playlist_id, is_single, cancel_event)
        else:
            _download_spotify(url, download_id, playlist_id, is_single, cancel_event)
    except Exception as exc:
        push_event(download_id, {'type': 'error', 'message': str(exc)})
    finally:
        with _lock:
            _cancel_flags.pop(download_id, None)
            _active_procs.pop(download_id, None)
            if _playlist_download_map.get(playlist_id) == download_id:
                _playlist_download_map.pop(playlist_id, None)
    push_event(download_id, {'type': 'done', 'playlist_id': playlist_id})


# ─── YouTube ──────────────────────────────────────────────────────────────────

def _download_youtube(url: str, download_id: str, playlist_id: int, is_single: bool = False,
                      cancel_event: 'threading.Event' = None):
    import yt_dlp
    from database import get_db

    if cancel_event is None:
        cancel_event = threading.Event()

    out_dir = os.path.join(DOWNLOADS_DIR, str(playlist_id))
    os.makedirs(out_dir, exist_ok=True)

    position = [0]  # mutable so closures can increment it

    def progress_hook(d):
        if cancel_event.is_set():
            raise yt_dlp.utils.DownloadError('Download cancelled')
        if d['status'] == 'downloading':
            push_event(download_id, {
                'type': 'progress',
                'track': d.get('info_dict', {}).get('title', '…'),
                'percent': d.get('_percent_str', '0%').strip(),
            })
        elif d['status'] == 'finished':
            push_event(download_id, {
                'type': 'track_done',
                'track': d.get('info_dict', {}).get('title', '…'),
            })

    def pp_hook(d):
        # MoveFiles fires exactly once per track after all postprocessors complete,
        # with the final .mp3 path confirmed in info_dict['filepath']
        if d['status'] != 'finished' or d.get('postprocessor') != 'MoveFiles':
            return
        info = d.get('info_dict', {})
        fp = info.get('filepath') or ''

        # If cancelled mid-flight, discard this file and skip the DB write
        if cancel_event.is_set():
            if fp and os.path.isfile(fp):
                try:
                    os.remove(fp)
                except OSError:
                    pass
            return

        title = info.get('title', 'Unknown')
        artist = info.get('uploader') or info.get('artist') or 'Unknown'
        duration = int(info.get('duration') or 0)
        thumb = info.get('thumbnail') or ''
        if not thumb and info.get('thumbnails'):
            thumb = info['thumbnails'][-1].get('url', '')
        pos = position[0]

        with get_db() as conn:
            conn.execute(
                '''INSERT OR REPLACE INTO tracks
                   (playlist_id, title, artist, duration, file_path, thumbnail, source_url, is_downloaded, position)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    playlist_id, title, artist, duration,
                    fp, thumb,
                    info.get('webpage_url', ''),
                    1 if fp else 0,
                    pos,
                ),
            )
            conn.execute(
                'UPDATE playlists SET downloaded_count='
                '(SELECT COUNT(*) FROM tracks WHERE playlist_id=? AND is_downloaded=1) WHERE id=?',
                (playlist_id, playlist_id),
            )

        position[0] += 1
        push_event(download_id, {
            'type': 'track_added',
            'track': title,
            'index': pos,
        })

    outtmpl = (
        os.path.join(out_dir, '%(title)s.%(ext)s')
        if is_single
        else os.path.join(out_dir, '%(playlist_index)03d - %(title)s.%(ext)s')
    )

    opts = {
        # m4a (itag 140) is widely available without SABR restrictions;
        # fallback to any audio, then any format as last resort
        'format': '140/bestaudio[ext=m4a]/bestaudio/best',
        'postprocessors': [
            {'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'},
            {'key': 'FFmpegMetadata'},
        ],
        'outtmpl': outtmpl,
        'progress_hooks': [progress_hook],
        'postprocessor_hooks': [pp_hook],
        'quiet': False,
        'no_warnings': False,
        'ignoreerrors': True,
        # Download each track's fragments in parallel for ~4x speed
        'concurrent_fragment_downloads': 8,
        # Stop fetching new playlist entries once cancel is requested
        'match_filter': lambda info, *, incomplete=False: 'cancelled' if cancel_event.is_set() else None,
        'break_on_reject': True,
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    # If cancelled, wipe whatever yt-dlp may have written and stop
    if cancel_event.is_set():
        import shutil
        if os.path.exists(out_dir):
            shutil.rmtree(out_dir, ignore_errors=True)
        return

    if not info:
        return

    raw_entries = info.get('entries') if 'entries' in info else None
    entries = [e for e in (raw_entries or []) if e] if raw_entries is not None else [info]

    # Fallback: if pp_hook never fired, scan the output dir and add any MP3s we missed
    if position[0] == 0:
        for i, fn in enumerate(sorted(f for f in os.listdir(out_dir) if f.endswith('.mp3'))):
            fp = os.path.join(out_dir, fn)
            title, artist, duration = fn[:-4], 'Unknown', 0
            try:
                from mutagen.mp3 import MP3
                audio = MP3(fp)
                duration = int(audio.info.length)
                if audio.tags:
                    title = str(audio.tags.get('TIT2', [title])[0])
                    artist = str(audio.tags.get('TPE1', ['Unknown'])[0])
            except Exception:
                pass
            with get_db() as conn:
                conn.execute(
                    '''INSERT OR REPLACE INTO tracks
                       (playlist_id, title, artist, duration, file_path, is_downloaded, position)
                       VALUES (?, ?, ?, ?, ?, 1, ?)''',
                    (playlist_id, title, artist, duration, fp, i),
                )
        with get_db() as conn:
            conn.execute(
                'UPDATE playlists SET downloaded_count='
                '(SELECT COUNT(*) FROM tracks WHERE playlist_id=? AND is_downloaded=1) WHERE id=?',
                (playlist_id, playlist_id),
            )

    with get_db() as conn:
        if is_single:
            conn.execute(
                'UPDATE playlists SET '
                'track_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=?), '
                'downloaded_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=? AND is_downloaded=1), '
                'status=? WHERE id=?',
                (playlist_id, playlist_id, 'completed', playlist_id),
            )
        else:
            conn.execute(
                'UPDATE playlists SET title=?, thumbnail=?, track_count=?, status=? WHERE id=?',
                (
                    info.get('title', 'YouTube Playlist'),
                    info.get('thumbnail') or (info.get('thumbnails') or [{}])[-1].get('url', ''),
                    len(entries),
                    'completed',
                    playlist_id,
                ),
            )


# ─── Spotify ──────────────────────────────────────────────────────────────────

def _fetch_spotify_playlist_meta(url: str):
    """Return (name, thumbnail_url) from the Spotify embed page, or (None, None) on failure."""
    import re, json, urllib.request
    m = re.search(r'playlist/([a-zA-Z0-9]+)', url)
    if not m:
        return None, None
    pid = m.group(1)
    try:
        req = urllib.request.Request(
            f'https://open.spotify.com/embed/playlist/{pid}',
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'text/html',
            },
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode('utf-8')
        dm = re.search(r'<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>', html)
        if not dm:
            return None, None
        data = json.loads(dm.group(1))
        entity = (data.get('props') or {}).get('pageProps', {}).get('state', {}).get('data', {}).get('entity', {})
        name = entity.get('name') or None
        images = entity.get('images') or []
        thumb = images[0].get('url') if images else None
        return name, thumb
    except Exception:
        return None, None


def _extract_cover_art(mp3_path: str, out_dir: str, playlist_id: int) -> str:
    """Extract embedded APIC cover art from mp3_path, save it, return local API URL or ''."""
    try:
        from mutagen.mp3 import MP3
        audio_file = MP3(mp3_path)
        if not audio_file.tags:
            return ''
        apic = audio_file.tags.get('APIC:')
        if not apic:
            apic = next((v for k, v in audio_file.tags.items() if k.startswith('APIC')), None)
        if not apic:
            return ''
        ext = 'png' if getattr(apic, 'mime', '') == 'image/png' else 'jpg'
        basename = os.path.splitext(os.path.basename(mp3_path))[0]
        cover_dir = os.path.join(out_dir, 'covers')
        os.makedirs(cover_dir, exist_ok=True)
        img_path = os.path.join(cover_dir, f'{basename}.{ext}')
        with open(img_path, 'wb') as f:
            f.write(apic.data)
        return f'/api/cover/{playlist_id}/{basename}.{ext}'
    except Exception:
        return ''


def _download_spotify(url: str, download_id: str, playlist_id: int, is_single: bool = False,
                      cancel_event: 'threading.Event' = None):
    import subprocess
    import re
    from database import get_db

    if cancel_event is None:
        cancel_event = threading.Event()

    out_dir = os.path.join(DOWNLOADS_DIR, str(playlist_id))
    os.makedirs(out_dir, exist_ok=True)

    # Fetch playlist name and cover before spotdl starts so the UI shows real info immediately
    if not is_single:
        pl_name, pl_thumb = _fetch_spotify_playlist_meta(url)
        if pl_name or pl_thumb:
            with get_db() as conn:
                conn.execute(
                    'UPDATE playlists SET title=COALESCE(?,title), thumbnail=COALESCE(?,thumbnail) WHERE id=?',
                    (pl_name, pl_thumb, playlist_id),
                )

    push_event(download_id, {'type': 'progress', 'track': 'Fetching Spotify playlist…', 'percent': '0%'})

    cmd = [
        'python3.11', '-m', 'spotdl', 'download', url,
        '--output', os.path.join(out_dir, '{artist} - {title}'),
        '--format', 'mp3',
        '--bitrate', '192k',
        '--threads', '4',
        '--audio', 'youtube-music', 'youtube',
        '--overwrite', 'skip',
        '--save-errors', os.path.join(out_dir, 'errors.txt'),
    ]
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1, env={**os.environ, 'PYTHONUNBUFFERED': '1'},
    )
    with _lock:
        _active_procs[download_id] = proc

    known_files: set = set()
    total_songs = [0]

    # For liked songs, offset position by the number of tracks already in the playlist
    with get_db() as conn:
        existing_count = conn.execute(
            'SELECT COUNT(*) FROM tracks WHERE playlist_id=?', (playlist_id,)
        ).fetchone()[0]
    position_offset = [existing_count]

    def _sync_new_tracks():
        try:
            current_mp3s = {f for f in os.listdir(out_dir) if f.endswith('.mp3')}
        except OSError:
            return
        for fn in sorted(current_mp3s - known_files):
            fp = os.path.join(out_dir, fn)
            title, artist, duration = fn[:-4], 'Unknown', 0
            try:
                from mutagen.mp3 import MP3
                audio_file = MP3(fp)
                duration = int(audio_file.info.length)
                if audio_file.tags:
                    title = str(audio_file.tags.get('TIT2', [title])[0])
                    artist = str(audio_file.tags.get('TPE1', ['Unknown'])[0])
            except Exception:
                pass
            thumb = _extract_cover_art(fp, out_dir, playlist_id)
            pos = position_offset[0] + len(known_files)
            with get_db() as conn:
                conn.execute(
                    '''INSERT OR REPLACE INTO tracks
                       (playlist_id, title, artist, duration, file_path, thumbnail, is_downloaded, position)
                       VALUES (?, ?, ?, ?, ?, ?, 1, ?)''',
                    (playlist_id, title, artist, duration, fp, thumb, pos),
                )
                conn.execute(
                    'UPDATE playlists SET downloaded_count='
                    '(SELECT COUNT(*) FROM tracks WHERE playlist_id=? AND is_downloaded=1) WHERE id=?',
                    (playlist_id, playlist_id),
                )
            known_files.add(fn)
            push_event(download_id, {
                'type': 'track_added',
                'track': title,
                'index': pos,
            })

    def _overall_pct() -> str:
        n = len(known_files)
        total = total_songs[0]
        if total:
            return f'{min(int(n / total * 100), 99)}%'
        return f'{min(n * 4, 99)}%'

    for line in proc.stdout:
        if cancel_event.is_set():
            proc.terminate()
            break
        line = line.strip()
        if not line or 'NotOpenSSLWarning' in line or 'urllib3' in line:
            continue

        # "Found 25 songs in Playlist Name" — capture total for percent calculation
        m = re.search(r'Found (\d+) song', line)
        if m:
            total_songs[0] = int(m.group(1))
            push_event(download_id, {
                'type': 'progress',
                'track': f'Found {total_songs[0]} songs, starting download…',
                'percent': '0%',
            })
            continue

        # Piped output (no TTY): Downloaded "Artist - Song": https://...
        # This fires once per completed track when stdout is not a terminal.
        m_dl = re.match(r'Downloaded\s+"(.+?)"', line)
        if m_dl:
            track_name = m_dl.group(1)
            _sync_new_tracks()
            push_event(download_id, {
                'type': 'progress',
                'track': track_name,
                'percent': _overall_pct(),
            })
            continue

        # TTY/rich output: ● Song - Artist (100%|████| 1/25 [...])
        if '●' in line:
            raw = line.lstrip('● ').strip()
            track_name = re.split(r'\s*\(\d', raw)[0].strip()
            if not track_name:
                track_name = raw.split('|')[0].strip() or raw
            push_event(download_id, {
                'type': 'progress',
                'track': track_name,
                'percent': _overall_pct(),
            })
            _sync_new_tracks()
            continue

        # Summary line at the end: "Downloaded 25 songs from …"
        if 'Downloaded' in line and 'songs from' in line:
            push_event(download_id, {'type': 'track_done', 'track': line})
            _sync_new_tracks()
            continue

        if any(kw in line for kw in ('Skipping', 'Failed')):
            _sync_new_tracks()

    proc.wait()
    _sync_new_tracks()  # catch any remaining files

    with get_db() as conn:
        if is_single:
            conn.execute(
                'UPDATE playlists SET '
                'track_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=?), '
                'downloaded_count=(SELECT COUNT(*) FROM tracks WHERE playlist_id=? AND is_downloaded=1), '
                'status=? WHERE id=?',
                (playlist_id, playlist_id, 'completed', playlist_id),
            )
        else:
            mp3s = sorted(f for f in os.listdir(out_dir) if f.endswith('.mp3'))
            conn.execute(
                'UPDATE playlists SET track_count=?, downloaded_count=?, status=? WHERE id=?',
                (len(mp3s), len(mp3s), 'completed', playlist_id),
            )
