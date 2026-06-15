@echo off
REM OfflineBeats — one-time setup for Windows
echo.
echo   ♫  OfflineBeats Setup
echo.

REM Check Python
python --version >nul 2>&1
IF ERRORLEVEL 1 (
  echo   ERROR: Python not found.
  echo   Download Python 3.11+ from https://www.python.org/downloads/
  echo   Make sure to check "Add Python to PATH" during installation.
  pause
  exit /b 1
)
echo   ^✓ Python found

REM Check ffmpeg
ffmpeg -version >nul 2>&1
IF ERRORLEVEL 1 (
  echo   Installing ffmpeg via winget...
  winget install --id Gyan.FFmpeg -e --silent
  IF ERRORLEVEL 1 (
    echo   Could not auto-install ffmpeg.
    echo   Download manually from https://ffmpeg.org/download.html and add to PATH.
  )
)

REM Python deps
echo ^> Installing Python packages...
python -m pip install -r backend\requirements.txt -q
echo   ^✓ Python packages installed

REM Node deps
echo ^> Installing Node packages...
cd frontend
npm install --silent
cd ..
echo   ^✓ Node packages installed

echo.
echo   Setup complete!
echo   Run the app:    start.bat
echo   Build desktop:  cd frontend ^&^& npm run dist:win
echo.
pause
