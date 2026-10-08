@echo off
title ResumePilotAI - Stop All Services (XAMPP-Strict)
color 0C
echo =========================================================
echo    Stopping ResumePilotAI Services and Watchdogs
echo    Policy: DIR-051 STRICT XAMPP + DIR-053 managed Backend API drain
echo =========================================================
echo.

echo [1/4] Disabling Scheduled Watchdogs...
schtasks /change /tn "AIBridge-LeadWatcher" /disable >nul 2>&1
schtasks /change /tn "AIBridge-LeadWatcher-Logon" /disable >nul 2>&1
schtasks /change /tn "AIBridge-LeadWatcher-Periodic" /disable >nul 2>&1

echo [2/4] Moving Startup scripts to disabled folder...
powershell -NoProfile -Command "$s = '$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup'; $d = Join-Path $s 'disabled'; if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force }; foreach ($f in @('ai-bridge-daemon.vbs','AIBridge-LeadWatcher.vbs','start_ai_local_model_service.vbs','ResumePilotBackend.vbs')) { $p = Join-Path $s $f; if (Test-Path $p) { Move-Item $p $d -Force } }"

echo [3/4] Terminating managed AI bridge daemons (prevents :8080 respawn before drain)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.CommandLine -match 'lead_watcher|auto_ai_router|local_model_service|index.js') -and ($_.Name -match 'node') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
taskkill /F /IM less.exe /IM git.exe >nul 2>&1
del /q "C:\Users\mbhas\.ai-bridge\*.pid" >nul 2>&1

echo [4/4] Stopping server stack via XAMPP (Apache 80/443 + MySQL 3306 + Backend API 8080)...
bridge xampp stop all

echo.
echo =========================================================
echo   SUCCESS! All services stopped and defused.
echo   - XAMPP Apache + MySQL + Backend API stopped via 'bridge xampp stop all'
echo   System is completely quiet and free for clean rest.
echo =========================================================
timeout /t 4
