@echo off
title ResumePilotAI - Start Services
color 0A
echo =======================================================
echo    Starting ResumePilotAI Services and Watchdogs
echo =======================================================
echo.

echo [1/3] Restoring Startup scripts...
powershell -NoProfile -Command "$s = '$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup'; if (Test-Path \"$s\disabled\*.vbs\") { Move-Item \"$s\disabled\*.vbs\" $s -Force }"

echo [2/3] Enabling Scheduled Watchdogs...
schtasks /change /tn "AIBridge-LeadWatcher" /enable >nul 2>&1
schtasks /change /tn "AIBridge-LeadWatcher-Logon" /enable >nul 2>&1
schtasks /change /tn "AIBridge-LeadWatcher-Periodic" /enable >nul 2>&1

echo [3/3] Starting Backend Server and AI Bridge Watcher...
start /min "ResumePilot Backend" cmd /c "cd /d D:\xampp\htdocs\IME365 && node index.js"
start /min "AI Bridge Watcher" cmd /c "node \"C:\Users\mbhas\.ai-bridge\lead_watcher_daemon.cjs\" --loop"

echo.
echo =======================================================
echo   SUCCESS! All services and watchdogs are active.
echo   - Backend Server: http://localhost:8080
echo   - AI Bridge Watcher: Running in background
echo =======================================================
timeout /t 4
