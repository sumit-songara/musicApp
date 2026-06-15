#!/usr/bin/env bash
# Run backend + frontend dev server in parallel (hot reload)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ♫  OfflineBeats — Dev Mode"
echo "  Backend: http://localhost:7777"
echo "  Frontend: http://localhost:3000"
echo ""

trap 'kill 0' EXIT

# Backend
cd "$ROOT/backend"
python3.11 app.py &
BACKEND_PID=$!

# Frontend dev server
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run dev &
FRONTEND_PID=$!

wait
