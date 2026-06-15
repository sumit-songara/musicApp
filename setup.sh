#!/usr/bin/env bash
# OfflineBeats — one-time setup for Mac/Linux
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ♫  OfflineBeats Setup"
echo ""

# ── Python 3.11 ────────────────────────────────────────────────────────────────
if ! command -v python3.11 &>/dev/null; then
  echo "▶ Installing Python 3.11 via Homebrew..."
  if ! command -v brew &>/dev/null; then
    echo "  ERROR: Homebrew not found. Install it from https://brew.sh then re-run."
    exit 1
  fi
  brew install python@3.11
fi
echo "  ✓ Python $(python3.11 --version)"

# ── ffmpeg ─────────────────────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "▶ Installing ffmpeg..."
  brew install ffmpeg
fi
echo "  ✓ ffmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"

# ── Python dependencies ────────────────────────────────────────────────────────
echo "▶ Installing Python packages..."
python3.11 -m pip install -r "$ROOT/backend/requirements.txt" -q
echo "  ✓ Flask, yt-dlp, spotdl, mutagen installed"

# ── Node dependencies ──────────────────────────────────────────────────────────
echo "▶ Installing Node packages..."
cd "$ROOT/frontend"
npm install --silent
echo "  ✓ React, Electron, Vite installed"

echo ""
echo "  ✅  Setup complete!"
echo "  Run the app:    ./start.sh"
echo "  Dev mode:       ./dev.sh"
echo "  Build desktop:  cd frontend && npm run dist:mac"
echo ""
