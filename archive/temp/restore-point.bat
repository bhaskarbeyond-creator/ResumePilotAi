@echo off
REM Emergency 1-Click Rollback Script for Windows
cd /d "%~dp0\.."
echo =======================================================
echo Restoring code and database to restore-point-2026-10-02-stable
echo =======================================================
node scripts\restore-from-point.mjs
pause
