# OfflineBeats 🎵

> Download YouTube & Spotify playlists once. Play them forever — no internet needed.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
![Python](https://img.shields.io/badge/python-3.11%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What it does

OfflineBeats lets you build a personal offline music library:

- **Paste a YouTube playlist URL** → downloads every track as 192 kbps MP3
- **Paste a Spotify playlist URL** → finds each track on YouTube Music, downloads it
- **Import a local folder** → scan any folder on your laptop for existing MP3/FLAC/AAC files
- **Play everything offline** — once downloaded, zero internet required
- **Access from your phone** — open the app on your laptop, connect your phone to the same WiFi, go to `http://<your-laptop-ip>:7777`

---

## Download

### Mac (easiest)

1. Install prerequisites once:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   brew install python@3.11 ffmpeg
   pip3.11 install flask flask-cors yt-dlp spotdl mutagen
   ```

2. [Download the latest `.dmg`](../../releases/latest) from the Releases page
3. Open the `.dmg`, drag **OfflineBeats** into **Applications**
4. Double-click **OfflineBeats** in Applications — it opens just like Spotify

> **First launch on Mac:** macOS may say "unidentified developer". Right-click the app → Open → Open to allow it once.

### Windows

1. Install [Python 3.11](https://www.python.org/downloads/) — check **"Add Python to PATH"**
2. Install [ffmpeg](https://ffmpeg.org/download.html) and add it to PATH
3. Run in a terminal:
   ```
   pip install flask flask-cors yt-dlp spotdl mutagen
   ```
4. [Download the latest `.exe` installer](../../releases/latest) from Releases
5. Run the installer, launch **OfflineBeats** from the Start menu

### Build from source (all platforms)

```bash
git clone https://github.com/YOUR_USERNAME/offlinebeats.git
cd offlinebeats

# Mac / Linux — one command sets everything up
chmod +x setup.sh && ./setup.sh

# Then build the native app:
cd frontend
npm run dist:mac    # → creates dist-electron/OfflineBeats.dmg
npm run dist:win    # → creates dist-electron/OfflineBeats Setup.exe
npm run dist:linux  # → creates dist-electron/OfflineBeats.AppImage

# Or just run it as a web app (no build needed):
cd ..
./start.sh          # Open http://localhost:7777 in any browser
```

---

## Usage

### Adding music

Click **+** in the sidebar to open the Add Music modal. Three options:

| Tab | How to use |
|-----|-----------|
| 💾 **Local Folder** | Type a folder path like `~/Music`. The app scans it instantly and imports all audio files. Works 100% offline. |
| ▶ **YouTube** | Paste any `youtube.com/playlist?list=...` URL. Downloads all tracks as MP3. |
| ● **Spotify** | Paste any `open.spotify.com/playlist/...` URL. Finds each track on YouTube Music and downloads it. |

### Playing music

- Click any track in a playlist to play it
- Use the **player bar** at the bottom to control playback
- **Shuffle**, **repeat**, and **volume** controls are in the player bar
- The **audio visualizer** shows real-time frequency bars

### Using from your phone

1. Make sure your phone and laptop are on the **same WiFi network**
2. Find your laptop's local IP (shown when the app starts, or run `ifconfig` / `ipconfig`)
3. Open `http://192.168.X.X:7777` in your phone's browser
4. Full UI works on mobile — the layout is responsive

---

## How it works

```
┌─────────────────────────────────────────────┐
│              Electron Shell                  │  ← native Mac/Windows app
│  ┌──────────────────────────────────────┐   │
│  │         React Frontend (Vite)        │   │  ← Spotify-like UI
│  │  Framer Motion · Zustand · Web Audio │   │
│  └──────────────────┬───────────────────┘   │
│                     │  HTTP / SSE            │
│  ┌──────────────────▼───────────────────┐   │
│  │       Flask Backend (Python 3.11)    │   │  ← local server
│  │  yt-dlp · spotdl · SQLite · mutagen │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
         ↓ downloads to
    ~/offlinebeats/downloads/
```

- **Backend**: Python/Flask serves the API and audio files over HTTP (supports Range requests for seeking)
- **Frontend**: React app with real Web Audio API visualizer and Framer Motion animations
- **Electron**: Wraps both into a native desktop app — starts Flask automatically, shows a loading screen until ready
- **Downloads folder**: All music stored as MP3 in `downloads/<playlist_id>/`

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 42 |
| Frontend | React 18, Vite 5, Tailwind CSS, Framer Motion |
| State | Zustand |
| Audio | HTML5 Audio + Web Audio API (visualizer) |
| Backend | Python 3.11, Flask 3, flask-cors |
| YouTube download | yt-dlp (tv_embedded client, concurrent fragments) |
| Spotify download | spotdl 4.5 (searches YouTube Music) |
| Audio metadata | mutagen |
| Database | SQLite (local, no server needed) |

---

## Folder structure

```
offlinebeats/
├── backend/              Python/Flask server
│   ├── app.py            Main Flask app
│   ├── database.py       SQLite schema
│   ├── config.py         Paths config
│   ├── routes/           API endpoints
│   │   ├── playlists.py  CRUD playlists
│   │   ├── downloads.py  Download + SSE progress
│   │   ├── audio.py      Serve audio files
│   │   └── local.py      Scan local folders
│   └── services/
│       └── downloader.py yt-dlp + spotdl logic
│
├── frontend/             React app
│   ├── electron/         Electron main process
│   │   ├── main.js       App window + Flask lifecycle
│   │   └── preload.js    Context bridge
│   └── src/
│       ├── components/   UI components
│       │   ├── Player/   Audio player bar + visualizer
│       │   ├── Sidebar/  Navigation + playlist list
│       │   └── ...
│       ├── hooks/        usePlayer, useVisualizer
│       ├── store/        Zustand global state
│       └── pages/        Home, Library, PlaylistView
│
├── downloads/            Downloaded music files
├── setup.sh              One-command Mac/Linux setup
├── setup.bat             One-command Windows setup
├── start.sh              Run as web app (Mac/Linux)
└── start.bat             Run as web app (Windows)
```

---

## FAQ

**Q: Do I need a Spotify account?**  
No. Spotify playlists are downloaded by searching YouTube Music — no Spotify login required.

**Q: Do I need a YouTube account?**  
No. yt-dlp downloads public playlists without authentication.

**Q: Where are the downloaded files saved?**  
In the `downloads/` folder inside the app directory. Each playlist gets its own subfolder.

**Q: Can I play existing MP3 files I already have?**  
Yes — use the **Local Folder** tab in the Add Music modal. Point it to any folder.

**Q: Does it work on mobile?**  
The web interface works on mobile browsers when your phone is on the same WiFi as your laptop. There's no native iOS/Android app yet.

**Q: How fast are downloads?**  
Each track downloads 4 fragments in parallel. A 20-track playlist typically completes in 2–5 minutes depending on your connection.

---

## Contributing

Pull requests welcome. Open an issue first for major changes.

---

## License

MIT — free to use, modify, and distribute.
