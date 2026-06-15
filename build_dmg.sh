#!/usr/bin/env bash
# Build a fully self-contained OfflineBeats.dmg
# No Python, no pip, no setup — user just drags to Applications and opens.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$ROOT/frontend"
RESOURCES="$FRONTEND/resources"
PYTHON_DIR="$RESOURCES/python"
BACKEND_RES="$RESOURCES/backend"

echo ""
echo "  ♫  OfflineBeats — Build self-contained DMG"
echo ""

# ── Prerequisites ──────────────────────────────────────────────────────────────
for cmd in node npm curl tar; do
  command -v $cmd &>/dev/null || { echo "  ERROR: $cmd not found"; exit 1; }
done
command -v ffmpeg &>/dev/null || { echo "  ERROR: ffmpeg not found. Run: brew install ffmpeg"; exit 1; }

# ── Bundle standalone Python 3.11 (no system Python needed on user's Mac) ─────
ARCH=$(uname -m)   # arm64 or x86_64
if [ "$ARCH" = "arm64" ]; then
  PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20241002/cpython-3.11.10+20241002-aarch64-apple-darwin-install_only.tar.gz"
else
  PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20241002/cpython-3.11.10+20241002-x86_64-apple-darwin-install_only.tar.gz"
fi

if [ ! -f "$PYTHON_DIR/bin/python3.11" ]; then
  echo "▶ Downloading portable Python 3.11 ($ARCH)..."
  mkdir -p "$RESOURCES"
  TMP="$(mktemp /tmp/py-XXXX.tar.gz)"
  curl -L "$PY_URL" -o "$TMP" --progress-bar
  tar -xzf "$TMP" -C "$RESOURCES"
  rm "$TMP"
  echo "  ✓ Python $(${PYTHON_DIR}/bin/python3.11 --version)"
else
  echo "  ✓ Portable Python already downloaded (cached)"
fi

# ── Install Python packages into bundled Python ────────────────────────────────
echo "▶ Installing Python packages into bundled Python..."
"$PYTHON_DIR/bin/pip3.11" install \
  flask flask-cors yt-dlp spotdl mutagen \
  -q --disable-pip-version-check
echo "  ✓ Flask, yt-dlp, spotdl, mutagen installed"

# ── Bundle backend code (always re-sync so changes are picked up) ──────────────
echo "▶ Copying backend..."
rm -rf "$BACKEND_RES"
cp -r "$ROOT/backend" "$BACKEND_RES"
# Remove __pycache__ to keep bundle clean
find "$BACKEND_RES" -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
echo "  ✓ Backend copied"

# ── Bundle ffmpeg ──────────────────────────────────────────────────────────────
FFMPEG_BIN="$RESOURCES/ffmpeg"
if [ ! -f "$FFMPEG_BIN" ]; then
  echo "▶ Copying ffmpeg binary..."
  cp "$(command -v ffmpeg)" "$FFMPEG_BIN"
  echo "  ✓ ffmpeg bundled"
else
  echo "  ✓ ffmpeg already bundled (cached)"
fi

# ── Node dependencies ──────────────────────────────────────────────────────────
echo "▶ Installing Node packages..."
cd "$FRONTEND"
npm install --silent
echo "  ✓ done"

# ── Build React frontend ───────────────────────────────────────────────────────
echo "▶ Building React app..."
npm run build --silent
echo "  ✓ done"

# ── Build DMG ─────────────────────────────────────────────────────────────────
echo "▶ Packaging DMG (~2 min)..."
npm run dist:mac -- --publish never 2>&1 | grep -E "(packaging|building|downloading|error|Error|warn)" || true
echo "  ✓ done"

# ── Result ────────────────────────────────────────────────────────────────────
cd "$ROOT"
DMG=$(find dist-electron -name "*.dmg" 2>/dev/null | sort -r | head -1)
if [ -n "$DMG" ]; then
  SIZE=$(du -sh "$DMG" | cut -f1)
  echo ""
  echo "  ✅  DMG ready!"
  echo "      $ROOT/$DMG  ($SIZE)"
  echo ""
  echo "  ─────────────────────────────────────────"
  echo "  Install:  Open the .dmg → drag to /Applications"
  echo "  Launch:   Double-click OfflineBeats — works instantly, no setup"
  echo "  ─────────────────────────────────────────"
  echo ""
  open "$(dirname "$ROOT/$DMG")"
else
  echo "  ⚠️  Build failed — check output above"
  exit 1
fi
