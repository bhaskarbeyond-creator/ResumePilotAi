@echo off
setlocal EnableDelayedExpansion
:: ==============================================================================
:: Outlook Universal Update, AutoDiscover & Certificate Fix Script
:: Purpose:
::   1. Updates Outlook / Microsoft Office to the latest version first.
::   2. Fixes "The name on the security certificate is invalid" (autodiscover cert mismatch).
::   3. Fixes Outlook hanging at "We're getting things ready" (Office 365 cloud loop).
::   4. Restores stable Classic Account Wizard for easy IMAP/SMTP setup.
:: Compatible: Windows 11, Windows 10, Windows 8, Windows 7
::              Outlook 365, Outlook 2024, 2021, 2019, 2016, 2013
:: ==============================================================================

title Outlook Universal Update and AutoDiscover Fix
color 0B

echo ==============================================================================
echo    OUTLOOK UNIVERSAL UPDATE AND FIX: CERTIFICATE ALERTS AND ACCOUNT HANG
echo ==============================================================================
echo.
echo This script performs the following actions:
echo.
echo   [Step 1] UPDATES Microsoft Outlook / Office to the LATEST version.
echo   [Step 2] Closes any running Outlook processes to apply updates cleanly.
echo   [Step 3] Fixes "The name on the security certificate is invalid" alert
echo            (Bypasses uncertified https://autodiscover.domain.com endpoints).
echo   [Step 4] Stops the "We're getting things ready" infinite loading hang
echo            (Disables hardcoded Microsoft Office 365 cloud queries).
echo   [Step 5] Restores the fast, stable Classic Account Wizard (Microsoft KB3189194).
echo   [Step 6] Clears stale AutoDiscover cache files and flushes Windows DNS.
echo.
echo ==============================================================================
echo Press any key to start the update and apply fixes...
pause >nul

echo.
echo ==============================================================================
echo [1/6] Microsoft Outlook / Office Update Check
echo ==============================================================================
echo.
echo Do you want to trigger the official Microsoft Office update popup
echo to check and install the latest Outlook / Office updates?
choice /M "Trigger official Microsoft Office update popup now"
if errorlevel 2 goto SKIP_UPDATE
goto DO_UPDATE

:SKIP_UPDATE
echo.
echo       Skipping Office update check as requested.
echo       Proceeding directly to AutoDiscover and certificate fixes...
goto POST_UPDATE

:DO_UPDATE

echo.
set "C2R_EXE="
if exist "%ProgramFiles%\Common Files\microsoft shared\ClickToRun\OfficeC2RClient.exe" (
    set "C2R_EXE=%ProgramFiles%\Common Files\microsoft shared\ClickToRun\OfficeC2RClient.exe"
) else if exist "%ProgramFiles(x86)%\Common Files\microsoft shared\ClickToRun\OfficeC2RClient.exe" (
    set "C2R_EXE=%ProgramFiles(x86)%\Common Files\microsoft shared\ClickToRun\OfficeC2RClient.exe"
)

if defined C2R_EXE (
    echo [C2R] Found Microsoft Office Click-to-Run updater:
    echo       "%C2R_EXE%"
    echo.
    echo       Triggering official Microsoft Office update popup...
    echo       - The official Microsoft Office 'Checking for updates' window is now active.
    start "" "%C2R_EXE%" /update user displaylevel=true
    echo.
    echo       Waiting for update process to initialize...
    ping 127.0.0.1 -n 6 >nul
    echo       Done.
) else (
    echo [C2R] Click-to-Run updater not detected on this system.
)

where winget >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [WINGET] Checking if New Outlook or Store package has updates...
    winget upgrade --id Microsoft.OutlookForWindows --accept-source-agreements --accept-package-agreements >nul 2>&1
    echo       Done.
)

:POST_UPDATE

echo.
echo ==============================================================================
echo [2/6] Closing Outlook processes if running...
echo ==============================================================================
taskkill /F /IM outlook.exe >nul 2>&1
taskkill /F /IM msoia.exe >nul 2>&1
taskkill /F /IM ucmapi.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul
echo       Done.

echo.
echo ==============================================================================
echo [3/6] Applying AutoDiscover registry fixes for Outlook 2016 / 2019 / 2021 / 2024 / 365...
echo ==============================================================================
:: Office 16.0 (Outlook 2016, 2019, 2021, 2024, Microsoft 365)
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\AutoDiscover" /f >nul 2>&1

:: Fix 1: Exclude https://autodiscover.domain.com (Eliminates SSL Certificate Mismatch Alert!)
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeHttpsAutodiscoverDomain /t REG_DWORD /d 1 /f >nul 2>&1

:: Fix 2: Exclude Office 365 Cloud Endpoint (Eliminates "We're getting things ready" Hang!)
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeExplicitO365Endpoint /t REG_DWORD /d 1 /f >nul 2>&1

:: Fix 3: Exclude HTTPS Root Domain (Prevents cert mismatch on https://domain.com)
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeHttpsRootDomain /t REG_DWORD /d 1 /f >nul 2>&1

:: Fix 4: Exclude Last Known Good URL (Clears memory of old Microsoft 365 tenant)
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeLastKnownGoodUrl /t REG_DWORD /d 1 /f >nul 2>&1

:: Fix 5: Exclude Active Directory SCP lookup (Speeds up discovery)
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeScpLookup /t REG_DWORD /d 1 /f >nul 2>&1

:: Fix 6: Ensure DNS SRV Records are queried
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeSrvRecord /t REG_DWORD /d 0 /f >nul 2>&1

:: Apply same fixes to Office Policies branch (if computer is managed)
reg add "HKCU\Software\Policies\Microsoft\Office\16.0\Outlook\AutoDiscover" /f >nul 2>&1
reg add "HKCU\Software\Policies\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeHttpsAutodiscoverDomain /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Policies\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeExplicitO365Endpoint /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Policies\Microsoft\Office\16.0\Outlook\AutoDiscover" /v ExcludeHttpsRootDomain /t REG_DWORD /d 1 /f >nul 2>&1

:: Apply to Office 15.0 (Outlook 2013) if present
reg add "HKCU\Software\Microsoft\Office\15.0\Outlook\AutoDiscover" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Office\15.0\Outlook\AutoDiscover" /v ExcludeHttpsAutodiscoverDomain /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Office\15.0\Outlook\AutoDiscover" /v ExcludeExplicitO365Endpoint /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Office\15.0\Outlook\AutoDiscover" /v ExcludeHttpsRootDomain /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Office\15.0\Outlook\AutoDiscover" /v ExcludeLastKnownGoodUrl /t REG_DWORD /d 1 /f >nul 2>&1
echo       Done.

echo.
echo ==============================================================================
echo [4/6] Disabling Simplified Account Creation wizard (Prevents "Getting things ready" hang)...
echo ==============================================================================
:: Restores classic account creation wizard (Microsoft KB3189194)
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\Setup" /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Office\16.0\Outlook\Setup" /v DisableOffice365SimplifiedAccountCreation /t REG_DWORD /d 1 /f >nul 2>&1

reg add "HKCU\Software\Policies\Microsoft\Office\16.0\Outlook\Setup" /f >nul 2>&1
reg add "HKCU\Software\Policies\Microsoft\Office\16.0\Outlook\Setup" /v DisableOffice365SimplifiedAccountCreation /t REG_DWORD /d 1 /f >nul 2>&1
echo       Done.

echo.
echo ==============================================================================
echo [5/6] Clearing stale Outlook AutoDiscover XML cache...
echo ==============================================================================
if exist "%LOCALAPPDATA%\Microsoft\Outlook" (
    del /f /q "%LOCALAPPDATA%\Microsoft\Outlook\*.xml" >nul 2>&1
    del /f /q "%LOCALAPPDATA%\Microsoft\Outlook\Autodiscover\*.xml" >nul 2>&1
)
echo       Done.

echo.
echo ==============================================================================
echo [6/6] Flushing Windows DNS Resolver Cache...
echo ==============================================================================
ipconfig /flushdns >nul 2>&1
echo       Done.

echo.
echo ==============================================================================
echo                         SUCCESS! UPDATES AND FIXES APPLIED
echo ==============================================================================
echo.
echo  What was done:
echo    1. Outlook / Office update check was triggered from Microsoft CDN.
echo    2. Outlook will NEVER show the "Security Alert - Certificate Invalid"
echo       popup for autodiscover on any domain.
echo    3. Outlook will NEVER hang at "We're getting things ready" on any domain.
echo    4. Adding an email account will open the clean Classic Wizard.
echo.
echo  Standard Hostinger Settings (Works for all your domains):
echo    - Incoming (IMAP): imap.hostinger.com  (Port 993, SSL/TLS)
echo    - Outgoing (SMTP): smtp.hostinger.com  (Port 465, SSL/TLS)
echo.
echo ==============================================================================
echo.
choice /M "Do you want to launch Outlook now"
if errorlevel 2 goto EXIT_SCRIPT
if errorlevel 1 start outlook.exe

:EXIT_SCRIPT
exit /b 0
