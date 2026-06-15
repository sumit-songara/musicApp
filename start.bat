@echo off
REM OfflineBeats — Start on Windows
cd /d "%~dp0"

echo Building frontend...
cd frontend
npm run build --silent
cd ..

echo Starting OfflineBeats...
start "" "http://localhost:7777"
python backend\app.py
