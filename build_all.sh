#!/usr/bin/env bash
# OfflineBeats — Build all distributables from one place
#
# ┌──────────────────────────────────────────────────────────┐
# │  Run on Mac  →  builds DMG + APK + EXE (if Wine present) │
# │  Run on Win  →  use build_all.bat instead for EXE        │
# └──────────────────────────────────────────────────────────┘
#
# Usage:
#   ./build_all.sh               → DMG + APK + EXE (if Wine)
#   ./build_all.sh --mac-only    → DMG only (fastest)
#   ./build_all.sh --skip-apk   → DMG + EXE, no APK
#   ./build_all.sh --skip-win   → DMG + APK, no EXE
#
# Prerequisites:
#   Always       → node, npm, curl, tar
#   Mac DMG      → ffmpeg         : brew install ffmpeg
#   Android APK  → eas-cli        : npm install -g eas-cli  (+ expo.dev account)
#   Windows EXE  → wine           : brew install --cask wine-stable
#                  (M-series Mac) : brew install --cask wine-crossover
#
# All outputs land in:  releases/
#   OfflineBeats-mac.dmg
#   OfflineBeats-win-setup.exe
#   OfflineBeats-android.apk

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$ROOT/frontend"
MOBILE="$ROOT/mobile"
RESOURCES="$FRONTEND/resources"
RELEASES="$ROOT/releases"
PYTHON_DIR="$RESOURCES/python"

# ── Colours ────────────────────────────────────────────────────────────────────
B='\033[1m'; GR='\033[0;32m'; YE='\033[1;33m'; RE='\033[0;31m'; BL='\033[0;34m'; RS='\033[0m'
section() { echo; printf "${B}${BL}══════════════════════════════════════════${RS}\n"; printf "${B}${BL}  %s${RS}\n" "$1"; printf "${B}${BL}══════════════════════════════════════════${RS}\n"; }
step()    { printf "${GR}▶${RS} %s\n" "$1"; }
done_()   { printf "${GR}  ✓${RS} %s\n" "$1"; }
warn()    { printf "${YE}  ⚠${RS} %s\n" "$1"; }
fail()    { printf "${RE}  ✗${RS} %s\n" "$1"; }

# ── Flags ──────────────────────────────────────────────────────────────────────
DO_WIN=true; DO_APK=true
for arg in "$@"; do
  case $arg in
    --mac-only)  DO_WIN=false; DO_APK=false ;;
    --skip-win)  DO_WIN=false ;;
    --skip-apk)  DO_APK=false ;;
  esac
done

RESULT_DMG=""; RESULT_EXE=""; RESULT_APK=""
mkdir -p "$RELEASES"

printf "\n${B}  ♫  OfflineBeats — Build All Platforms${RS}\n"
printf "     Outputs → %s\n" "$RELEASES"

# ══════════════════════════════════════════════════════════════════════════════
section "1 / 3   Mac DMG"
# ══════════════════════════════════════════════════════════════════════════════

for cmd in node npm curl tar; do
  command -v $cmd &>/dev/null || { fail "Missing: $cmd"; exit 1; }
done
command -v ffmpeg &>/dev/null || { fail "ffmpeg not found — run: brew install ffmpeg"; exit 1; }

# Download portable macOS Python 3.11
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  PY_MAC_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20241002/cpython-3.11.10+20241002-aarch64-apple-darwin-install_only.tar.gz"
else
  PY_MAC_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20241002/cpython-3.11.10+20241002-x86_64-apple-darwin-install_only.tar.gz"
fi

if [ ! -f "$PYTHON_DIR/bin/python3.11" ]; then
  step "Downloading portable macOS Python 3.11 ($ARCH)..."
  mkdir -p "$RESOURCES"
  TMP=$(mktemp /tmp/py-mac-XXXX.tar.gz)
  curl -L "$PY_MAC_URL" -o "$TMP" --progress-bar
  tar -xzf "$TMP" -C "$RESOURCES"
  rm "$TMP"
  done_ "Python $("$PYTHON_DIR/bin/python3.11" --version)"
else
  done_ "macOS Python already cached"
fi

step "Installing Python packages..."
"$PYTHON_DIR/bin/pip3.11" install flask flask-cors yt-dlp spotdl mutagen \
  -q --disable-pip-version-check
done_ "flask, yt-dlp, spotdl, mutagen"

step "Copying backend..."
rm -rf "$RESOURCES/backend"
cp -r "$ROOT/backend" "$RESOURCES/backend"
find "$RESOURCES/backend" -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
done_ "Backend copied"

if [ ! -f "$RESOURCES/ffmpeg" ]; then
  step "Bundling ffmpeg..."
  cp "$(command -v ffmpeg)" "$RESOURCES/ffmpeg"
  done_ "ffmpeg bundled"
else
  done_ "ffmpeg already cached"
fi

step "Installing Node packages..."
cd "$FRONTEND" && npm install --silent
done_ "node_modules ready"

step "Building React app..."
npm run build --silent
done_ "Frontend built"

step "Packaging DMG (this takes ~2 min)..."
npm run dist:mac -- --publish never 2>&1 | grep -E "(packaging|building|error|Error)" || true

DMG_SRC=$(find "$ROOT/dist-electron" -name "*.dmg" 2>/dev/null | sort -r | head -1)
if [ -n "$DMG_SRC" ]; then
  cp "$DMG_SRC" "$RELEASES/OfflineBeats-mac.dmg"
  RESULT_DMG="$RELEASES/OfflineBeats-mac.dmg"
  SIZE=$(du -sh "$RESULT_DMG" | cut -f1)
  done_ "DMG → releases/OfflineBeats-mac.dmg  ($SIZE)"
else
  fail "DMG build failed — check output above"
  exit 1
fi

# ══════════════════════════════════════════════════════════════════════════════
section "2 / 3   Windows EXE  (cross-compile)"
# ══════════════════════════════════════════════════════════════════════════════

if [ "$DO_WIN" = "false" ]; then
  warn "Skipped (--skip-win)"
  RESULT_EXE="SKIPPED"

elif ! command -v wine &>/dev/null; then
  warn "Wine not installed — cannot build Windows EXE on Mac."
  warn ""
  warn "  Option A — Install Wine (one-time, ~1 GB), then re-run this script:"
  warn "    Intel Mac:  brew install --cask wine-stable"
  warn "    M-series:   brew install --cask wine-crossover"
  warn ""
  warn "  Option B — Build on a Windows machine instead:"
  warn "    Copy the project to Windows and run:  build_all.bat"
  RESULT_EXE="NEEDS_WINE"

else
  # ── Download Windows Python standalone (x64) ────────────────────────────────
  PY_WIN_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20241002/cpython-3.11.10+20241002-x86_64-pc-windows-msvc-shared-install_only.tar.gz"
  PY_WIN_DIR="$RESOURCES/python-win"

  if [ ! -f "$PY_WIN_DIR/python.exe" ]; then
    step "Downloading portable Windows Python 3.11 (x64)..."
    TMP_W=$(mktemp /tmp/py-win-XXXX.tar.gz)
    curl -L "$PY_WIN_URL" -o "$TMP_W" --progress-bar
    mkdir -p "$PY_WIN_DIR"
    tar -xzf "$TMP_W" --strip-components=1 -C "$PY_WIN_DIR"
    rm "$TMP_W"
    done_ "Windows Python extracted"
  else
    done_ "Windows Python already cached"
  fi

  # ── Install Python packages for Windows (cross-install from Mac via pip) ────
  WIN_SITE="$PY_WIN_DIR/Lib/site-packages"
  if [ ! -d "$WIN_SITE/flask" ]; then
    step "Cross-installing Python packages for Windows..."
    mkdir -p "$WIN_SITE"
    python3 -m pip install \
      --platform win_amd64 \
      --python-version 311 \
      --implementation cp \
      --only-binary :all: \
      --target "$WIN_SITE" \
      flask flask-cors yt-dlp spotdl mutagen \
      -q --disable-pip-version-check 2>&1 || {
        warn "Some packages may not have Windows binary wheels; EXE backend may be limited"
      }
    done_ "Windows packages cross-installed"
  else
    done_ "Windows packages already cached"
  fi

  # ── Download ffmpeg.exe for Windows ─────────────────────────────────────────
  FFMPEG_EXE="$RESOURCES/ffmpeg.exe"
  if [ ! -f "$FFMPEG_EXE" ]; then
    step "Downloading Windows ffmpeg.exe..."
    TMP_FF=$(mktemp -d)
    curl -L "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" \
      -o "$TMP_FF/ffmpeg-win.zip" --progress-bar
    unzip -q "$TMP_FF/ffmpeg-win.zip" -d "$TMP_FF"
    cp "$TMP_FF"/*/bin/ffmpeg.exe "$FFMPEG_EXE"
    rm -rf "$TMP_FF"
    done_ "ffmpeg.exe downloaded"
  else
    done_ "ffmpeg.exe already cached"
  fi

  # ── Swap: hide macOS Python, put Windows Python in place ────────────────────
  step "Swapping Python resources for Windows build..."
  mv "$PYTHON_DIR" "${PYTHON_DIR}.mac.bak"
  cp -r "$PY_WIN_DIR" "$PYTHON_DIR"
  done_ "Windows Python active"

  # ── Build Windows EXE ────────────────────────────────────────────────────────
  step "Packaging Windows EXE via Wine (~3 min)..."
  cd "$FRONTEND"
  npm run dist:win -- --publish never 2>&1 | grep -E "(packaging|building|error|Error)" || true

  # ── Restore macOS Python ─────────────────────────────────────────────────────
  rm -rf "$PYTHON_DIR"
  mv "${PYTHON_DIR}.mac.bak" "$PYTHON_DIR"
  done_ "macOS Python restored"

  EXE_SRC=$(find "$ROOT/dist-electron" -name "*.exe" 2>/dev/null | sort -r | head -1)
  if [ -n "$EXE_SRC" ]; then
    cp "$EXE_SRC" "$RELEASES/OfflineBeats-win-setup.exe"
    RESULT_EXE="$RELEASES/OfflineBeats-win-setup.exe"
    SIZE=$(du -sh "$RESULT_EXE" | cut -f1)
    done_ "EXE → releases/OfflineBeats-win-setup.exe  ($SIZE)"
  else
    fail "Windows EXE build failed — check output above"
    RESULT_EXE="FAILED"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
section "3 / 3   Android APK  (EAS cloud)"
# ══════════════════════════════════════════════════════════════════════════════

if [ "$DO_APK" = "false" ]; then
  warn "Skipped (--skip-apk)"
  RESULT_APK="SKIPPED"

elif ! command -v eas &>/dev/null; then
  warn "eas-cli not found. Install it and retry:"
  warn "  npm install -g eas-cli"
  warn "  eas login"
  warn "  ./build_all.sh --skip-win   ← to skip Wine / Windows"
  RESULT_APK="NO_EAS"

else
  step "Starting EAS cloud build (~10 min)..."
  cd "$MOBILE"

  # Capture output; try to find and auto-download the APK URL
  EAS_LOG=$(mktemp /tmp/eas-XXXX.log)
  eas build --platform android --profile preview --non-interactive 2>&1 | tee "$EAS_LOG" || true

  APK_URL=$(grep -oE 'https://[^ ]+\.apk' "$EAS_LOG" | tail -1 || echo "")
  rm -f "$EAS_LOG"

  if [ -n "$APK_URL" ]; then
    step "Downloading APK..."
    curl -L "$APK_URL" -o "$RELEASES/OfflineBeats-android.apk" --progress-bar
    RESULT_APK="$RELEASES/OfflineBeats-android.apk"
    SIZE=$(du -sh "$RESULT_APK" | cut -f1)
    done_ "APK → releases/OfflineBeats-android.apk  ($SIZE)"
  else
    warn "EAS build started — download the APK when it finishes:"
    warn "  → https://expo.dev/accounts  (under Builds)"
    warn "  Save it as: releases/OfflineBeats-android.apk"
    RESULT_APK="CLOUD"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Packaging ZIP"
# ══════════════════════════════════════════════════════════════════════════════

# Zip up whatever is in releases/ so you can send ONE file to anyone
ZIP_NAME="OfflineBeats-all-platforms.zip"
ZIP_PATH="$ROOT/$ZIP_NAME"

# Only zip if releases/ has at least one file
RELEASE_COUNT=$(find "$RELEASES" -maxdepth 1 -type f | wc -l | tr -d ' ')
if [ "$RELEASE_COUNT" -gt 0 ]; then
  step "Creating $ZIP_NAME..."
  cd "$ROOT"
  rm -f "$ZIP_PATH"
  zip -j "$ZIP_PATH" "$RELEASES"/OfflineBeats-*.{dmg,exe,apk} 2>/dev/null || \
  zip -j "$ZIP_PATH" "$RELEASES"/OfflineBeats-* 2>/dev/null || true
  if [ -f "$ZIP_PATH" ]; then
    SIZE=$(du -sh "$ZIP_PATH" | cut -f1)
    done_ "ZIP → $ZIP_NAME  ($SIZE)"
  fi
else
  warn "No release files found to zip"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Summary"
# ══════════════════════════════════════════════════════════════════════════════

echo
printf "  Output folder: %s\n\n" "$RELEASES"

[ "$RESULT_DMG" != ""          ] && printf "  ${GR}✓${RS}  Mac DMG     → releases/OfflineBeats-mac.dmg\n"

case "$RESULT_EXE" in
  SKIPPED)    printf "  ${YE}—${RS}  Win EXE     → skipped\n" ;;
  NEEDS_WINE) printf "  ${YE}⚠${RS}  Win EXE     → install Wine, then re-run  OR  use build_all.bat on Windows\n" ;;
  FAILED)     printf "  ${RE}✗${RS}  Win EXE     → build failed, check output above\n" ;;
  "")         : ;;
  *)          printf "  ${GR}✓${RS}  Win EXE     → releases/OfflineBeats-win-setup.exe\n" ;;
esac

case "$RESULT_APK" in
  SKIPPED)    printf "  ${YE}—${RS}  Android APK → skipped\n" ;;
  NO_EAS)     printf "  ${YE}⚠${RS}  Android APK → eas-cli not found, see instructions above\n" ;;
  CLOUD)      printf "  ${YE}⌛${RS}  Android APK → building in cloud, check expo.dev when done\n" ;;
  "")         : ;;
  *)          printf "  ${GR}✓${RS}  Android APK → releases/OfflineBeats-android.apk\n" ;;
esac

if [ -f "$ZIP_PATH" ]; then
  echo
  printf "  ${B}${GR}✓  Send this ONE file to anyone:${RS}\n"
  printf "  ${B}   %s${RS}\n" "$ZIP_NAME"
fi

echo
ls -lh "$RELEASES" 2>/dev/null || true
echo
open "$ROOT" 2>/dev/null || true
