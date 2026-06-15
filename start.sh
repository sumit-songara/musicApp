#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "  ♫  OfflineBeats"
echo ""

# ── Dependencies ──────────────────────────────────────────────────────────────
echo "▶ Checking Python dependencies..."
cd "$BACKEND"
if ! python3.11 -c "import flask" 2>/dev/null; then
  echo "  Installing Python packages..."
  python3.11 -m pip install -r requirements.txt -q
fi

echo "▶ Checking Node dependencies..."
cd "$FRONTEND"
if [ ! -d "node_modules" ]; then
  echo "  Installing Node packages (this takes a minute)..."
  npm install --silent
fi

# ── Build frontend ─────────────────────────────────────────────────────────────
echo "▶ Building React frontend..."
npm run build --silent

# ── Start Flask ────────────────────────────────────────────────────────────────
cd "$BACKEND"
echo ""
echo "  ✓ Starting server on http://localhost:7777"
echo "  ✓ Also accessible on your local network at http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I | awk '{print $1}'):7777"
echo ""
echo "  Press Ctrl+C to stop."
echo ""
python3.11 app.py
