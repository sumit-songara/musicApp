@echo off
setlocal EnableDelayedExpansion
REM OfflineBeats — Build Windows EXE + Android APK
REM Run this on a Windows machine from the project root.
REM
REM For Mac DMG, use build_all.sh on a Mac.
REM All outputs land in:  releases\
REM   OfflineBeats-win-setup.exe
REM   OfflineBeats-android.apk   (if eas-cli is installed)
REM
REM Prerequisites:
REM   node + npm   →  https://nodejs.org
REM   Python 3.11  →  https://python.org  (check "Add Python to PATH")
REM   ffmpeg       →  winget install Gyan.FFmpeg  OR  https://ffmpeg.org
REM   eas-cli      →  npm install -g eas-cli  (optional, for APK)

set "ROOT=%~dp0"
set "FRONTEND=%ROOT%frontend"
set "MOBILE=%ROOT%mobile"
set "RESOURCES=%FRONTEND%\resources"
set "RELEASES=%ROOT%releases"
set "PYTHON_WIN=%RESOURCES%\python"
set "BACKEND_RES=%RESOURCES%\backend"

echo.
echo   =====================================
echo     OfflineBeats — Build All Platforms
echo     Output: %RELEASES%
echo   =====================================
echo.

mkdir "%RELEASES%" 2>nul

REM ══════════════════════════════════════════════════════════════════════════════
echo.
echo   [1/2]  Checking prerequisites
echo   ─────────────────────────────────────
REM ══════════════════════════════════════════════════════════════════════════════

node --version >nul 2>&1
IF ERRORLEVEL 1 (
  echo   ERROR: node not found. Download from https://nodejs.org
  pause & exit /b 1
)
echo   OK node

npm --version >nul 2>&1
IF ERRORLEVEL 1 (
  echo   ERROR: npm not found.
  pause & exit /b 1
)
echo   OK npm

python --version >nul 2>&1
IF ERRORLEVEL 1 (
  echo   ERROR: Python not found. Download from https://python.org
  echo          During install, check "Add Python to PATH"
  pause & exit /b 1
)
echo   OK Python

ffmpeg -version >nul 2>&1
IF ERRORLEVEL 1 (
  echo   ffmpeg not found. Trying winget...
  winget install --id Gyan.FFmpeg -e --silent
  ffmpeg -version >nul 2>&1
  IF ERRORLEVEL 1 (
    echo   ERROR: ffmpeg still not found.
    echo   Download from https://ffmpeg.org and add to PATH, then re-run.
    pause & exit /b 1
  )
)
echo   OK ffmpeg

REM ══════════════════════════════════════════════════════════════════════════════
echo.
echo   [1/2]  Windows EXE
echo   ─────────────────────────────────────
REM ══════════════════════════════════════════════════════════════════════════════

REM ── Download bundled Python 3.11 (portable, no system Python needed by users) ──
set "PY_URL=https://github.com/astral-sh/python-build-standalone/releases/download/20241002/cpython-3.11.10+20241002-x86_64-pc-windows-msvc-shared-install_only.tar.gz"

IF NOT EXIST "%PYTHON_WIN%\python.exe" (
  echo ^> Downloading portable Python 3.11 ^(x64^)...
  curl -L "%PY_URL%" -o "%TEMP%\py-win.tar.gz" --progress-bar
  IF NOT EXIST "%PYTHON_WIN%" mkdir "%PYTHON_WIN%"
  tar -xzf "%TEMP%\py-win.tar.gz" --strip-components=1 -C "%PYTHON_WIN%"
  del "%TEMP%\py-win.tar.gz"
  echo   OK Portable Python 3.11 downloaded
) ELSE (
  echo   OK Portable Python already cached
)

REM ── Install Python packages into bundled Python ────────────────────────────
echo ^> Installing Python packages into bundled Python...
"%PYTHON_WIN%\python.exe" -m pip install flask flask-cors yt-dlp spotdl mutagen ^
  -q --disable-pip-version-check
echo   OK flask, yt-dlp, spotdl, mutagen installed

REM ── Bundle ffmpeg.exe ──────────────────────────────────────────────────────
IF NOT EXIST "%RESOURCES%\ffmpeg.exe" (
  echo ^> Copying ffmpeg.exe into resources...
  for /f "delims=" %%i in ('where ffmpeg 2^>nul') do (
    copy "%%i" "%RESOURCES%\ffmpeg.exe" >nul 2>&1
    echo   OK ffmpeg.exe bundled
    goto :ffmpeg_done
  )
  echo   WARN: Could not copy ffmpeg.exe — bundle will fall back to system ffmpeg
  :ffmpeg_done
) ELSE (
  echo   OK ffmpeg.exe already cached
)

REM ── Copy backend ──────────────────────────────────────────────────────────
echo ^> Copying backend...
IF EXIST "%BACKEND_RES%" rmdir /s /q "%BACKEND_RES%"
xcopy /E /I /Q /Y "%ROOT%backend" "%BACKEND_RES%" >nul
echo   OK Backend copied

REM ── Node dependencies ─────────────────────────────────────────────────────
echo ^> Installing Node packages...
cd "%FRONTEND%"
call npm install --silent
echo   OK Node packages installed

REM ── Build React frontend ──────────────────────────────────────────────────
echo ^> Building React app...
call npm run build --silent
echo   OK Frontend built

REM ── Build Windows EXE ─────────────────────────────────────────────────────
echo ^> Packaging Windows installer ^(this takes a few minutes^)...
call npm run dist:win -- --publish never
echo   OK Packaging done

REM ── Copy EXE to releases\ ─────────────────────────────────────────────────
cd "%ROOT%"
set "EXE_FILE="
for /f "delims=" %%f in ('dir /b /s "%ROOT%dist-electron\*.exe" 2^>nul') do (
  set "EXE_FILE=%%f"
)

IF DEFINED EXE_FILE (
  copy "%EXE_FILE%" "%RELEASES%\OfflineBeats-win-setup.exe" >nul
  echo.
  echo   OK  EXE  --^>  releases\OfflineBeats-win-setup.exe
) ELSE (
  echo.
  echo   ERROR: EXE build failed — check output above
  goto :apk
)

REM ══════════════════════════════════════════════════════════════════════════════
:apk
echo.
echo   [2/2]  Android APK  ^(EAS cloud^)
echo   ─────────────────────────────────────
REM ══════════════════════════════════════════════════════════════════════════════

where eas >nul 2>&1
IF ERRORLEVEL 1 (
  echo   eas-cli not found — skipping APK build.
  echo.
  echo   To build the APK later:
  echo     npm install -g eas-cli
  echo     eas login
  echo     cd mobile
  echo     eas build --platform android --profile preview
  echo.
  goto :summary
)

echo ^> Building APK in EAS cloud ^(~10 min^)...
cd "%MOBILE%"
call eas build --platform android --profile preview --non-interactive
echo.
echo   APK build started in the cloud.
echo   When finished, download from https://expo.dev/accounts
echo   Save it as: releases\OfflineBeats-android.apk

REM ══════════════════════════════════════════════════════════════════════════════
:summary
echo.
echo   =====================================
echo     All done!
echo     Output: %RELEASES%
echo   =====================================
echo.
dir /b "%RELEASES%" 2>nul
echo.
pause
