@echo off
title ResumePilotAI - Start Services (XAMPP-Strict)
color 0A
echo =======================================================
echo    Starting ResumePilotAI Services and Watchdogs
echo    Policy: DIR-051 STRICT XAMPP - zero detached node/vite spawns
echo =======================================================
echo.

echo [1/3] Restoring Startup scripts...
powershell -NoProfile -Command "$s = '$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup'; if (Test-Path \"$s\disabled\*.vbs\") { Move-Item \"$s\disabled\*.vbs\" $s -Force }"

echo [2/3] Enabling Scheduled Watchdogs...
schtasks /change /tn "AIBridge-LeadWatcher" /enable >nul 2>&1
schtasks /change /tn "AIBridge-LeadWatcher-Logon" /enable >nul 2>&1
schtasks /change /tn "AIBridge-LeadWatcher-Periodic" /enable >nul 2>&1

echo [3/3] Starting XAMPP servers (Apache 80/443 + MySQL 3306)...
bridge xampp start all

echo.
echo =======================================================
echo   SUCCESS! All services and watchdogs are active.
echo   - Web / Reverse Proxy: XAMPP Apache - http://ime365.local (80/443)
echo   - Database: XAMPP MariaDB/MySQL on port 3306
echo   - AI Bridge Watcher: Managed by scheduled tasks (no detached spawns)
echo =======================================================
timeout /t 4
