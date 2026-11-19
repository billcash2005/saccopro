@echo off
setlocal
cd /d "%~dp0"
title SaccoPro - Web App
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run the SaccoPro web app.
  echo Install it from https://nodejs.org (LTS) and run this file again.
  pause
  exit /b 1
)
echo Starting SaccoPro web app...
node "%~dp0serve.js" 5173 --open
pause
