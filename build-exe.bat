@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"
title Pyno's Squish - EXE Builder

echo ==========================================
echo  Pyno's Squish - EXE Builder
echo ==========================================
echo.

if not exist "node_modules" (
    echo [1/4] Installiere Abhaengigkeiten...
    call npm install
    if errorlevel 1 goto :fail
) else (
    echo [1/4] node_modules vorhanden, ueberspringe.
)

if not exist "resources\bin\ffmpeg.exe" (
    echo [2/4] FFmpeg fehlt, lade herunter...
    call npm run fetch-ffmpeg
    if errorlevel 1 goto :fail
) else (
    echo [2/4] FFmpeg vorhanden.
)

if not exist "build\icon.png" (
    echo [3/4] Erzeuge Icon...
    call npm run icon
    if errorlevel 1 goto :fail
) else (
    echo [3/4] Icon vorhanden.
)

echo [4/4] Typecheck, Tests, Build und Installer...
call npm run dist
if errorlevel 1 goto :fail

echo.
echo ==========================================
echo  Fertig: release\Pynos-Squish-Setup-*.exe
echo ==========================================
start "" "%~dp0release"
pause
exit /b 0

:fail
echo.
echo [FEHLER] Build fehlgeschlagen - siehe Ausgabe oben.
pause
exit /b 1
