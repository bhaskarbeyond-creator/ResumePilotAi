@echo off
title ResumePilot AI - Local Environment Launcher
echo ========================================================
echo   ResumePilot AI - Starting Local Server Environment
echo ========================================================
echo.

:: 1. Check & start XAMPP Apache if not running
tasklist /FI "IMAGENAME eq httpd.exe" 2>NUL | find /I /N "httpd.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Apache is already running on port 80.
) else (
    echo [*] Starting Apache...
    start /B "" "D:\xampp\apache\bin\httpd.exe" -d "D:/xampp/apache"
    echo [OK] Apache started.
)

:: 2. Check & start Node.js Backend on port 8080
netstat -ano | find "8080" | find "LISTENING" >NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] Backend API is already running on port 8080.
) else (
    echo [*] Starting Backend API on port 8080...
    start "ResumePilot Backend (Port 8080)" cmd /k "cd /d %~dp0backend && node index.js"
    echo [OK] Backend API started.
)

echo.
echo ========================================================
echo   Ready! Access your app at:
echo   https://ai-resume-builder.local/
echo   http://ai-resume-builder.local/
echo ========================================================
echo.
pause
