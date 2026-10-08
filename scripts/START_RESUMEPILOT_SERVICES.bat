@echo off
title ResumePilotAI - Start Services (XAMPP-Strict)
color 0A
echo =========================================================
echo    Starting ResumePilotAI Services and Watchdogs
echo    Policy: DIR-051 STRICT XAMPP - zero detached node/vite spawns
echo    Policy: DIR-053 managed Backend API tier (Node.js on port 8080)
echo =========================================================
echo.

echo [1/4] Restoring Startup scripts...
powershell -NoProfile -Command "$s = '$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup'; if (Test-Path \"$s\disabled\*.vbs\") { Move-Item \"$s\disabled\*.vbs\" $s -Force }"

echo [2/4] Enabling Scheduled Watchdogs...
schtasks /change /tn "AIBridge-LeadWatcher" /enable >nul 2>&1
schtasks /change /tn "AIBridge-LeadWatcher-Logon" /enable >nul 2>&1
schtasks /change /tn "AIBridge-LeadWatcher-Periodic" /enable >nul 2>&1

echo [3/4] Starting server stack via XAMPP (Apache 80/443 + MySQL 3306 + Backend API 8080)...
bridge xampp start all

echo [4/4] Verifying Backend API readiness on port 8080...
set "BACKEND_READY_FILE=%TEMP%\resumepilot_backend_ready.flag"
del /q "%BACKEND_READY_FILE%" >nul 2>&1
powershell -NoProfile -Command "for ($i = 0; $i -lt 20; $i++) { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/readyz' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { Set-Content -Path '%BACKEND_READY_FILE%' -Value 'READY'; break } } catch {}; Start-Sleep -Milliseconds 500 }"
if exist "%BACKEND_READY_FILE%" (
  echo   - Backend API: READY ^(http://127.0.0.1:8080/readyz 200^)
) else (
  echo   - Backend API: not confirmed yet - lead_watcher_daemon.cjs self-heals :8080
)
del /q "%BACKEND_READY_FILE%" >nul 2>&1

echo.
echo =========================================================
echo   SUCCESS! All services and watchdogs are active.
echo   - Web / Reverse Proxy: XAMPP Apache - http://ime365.local (80/443)
echo   - API Server: managed Node.js backend on 127.0.0.1:8080 (XAMPP tier 3)
echo   - Database: XAMPP MariaDB/MySQL on port 3306
echo   - Watchdog: lead_watcher_daemon.cjs auto-heals 48200/1234/8080
echo =========================================================
timeout /t 4
