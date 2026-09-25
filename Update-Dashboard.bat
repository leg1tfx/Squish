@echo off
rem Doppelklick startet das Update-Dashboard von Pyno's Squish im Browser.
title Pyno's Squish - Update-Dashboard
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js ist nicht installiert.
  echo  Bitte von https://nodejs.org die LTS-Version installieren
  echo  und danach diese Datei nochmal starten.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\aws4fetch" (
  echo.
  echo  Erster Start: Pakete werden installiert. Das dauert ein paar Minuten ...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Installation fehlgeschlagen. Siehe Meldungen oben.
    pause
    exit /b 1
  )
)

echo.
echo  Das Dashboard oeffnet sich gleich im Browser.
echo  Zum Beenden einfach dieses Fenster schliessen.
echo.
call npm run dashboard
echo.
pause
