@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"
title Pyno's Squish

echo ========================================
echo        Pyno's Squish - Start
echo ========================================
echo.

if not exist "node_modules" (
    echo [^>] Installiere Abhaengigkeiten...
    call npm install
    if errorlevel 1 (
        echo [FEHLER] npm install fehlgeschlagen
        pause
        exit /b 1
    )
)

if not exist "resources\bin\ffmpeg.exe" (
    echo [^>] FFmpeg fehlt, lade herunter...
    call npm run fetch-ffmpeg
    if errorlevel 1 (
        echo [FEHLER] FFmpeg-Download fehlgeschlagen
        pause
        exit /b 1
    )
)

echo [^>] Starte Pyno's Squish...
call npm run dev
if errorlevel 1 pause
