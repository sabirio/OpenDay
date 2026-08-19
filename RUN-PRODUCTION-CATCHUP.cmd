@echo off
setlocal
title OpenDay Production Database Catch-up

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release\Invoke-OwnerStagingCatchup.ps1" -Target production -RequireBackupVerification -SuccessMarker "PRODUCTION_CATCHUP=PASS"
set "openday_exit=%ERRORLEVEL%"

echo.
if "%openday_exit%"=="0" (
  echo OpenDay Production catch-up finished successfully.
) else (
  echo OpenDay Production catch-up stopped with an error.
  echo Do not run it again. Send the error text to Codex.
)
echo.
pause
exit /b %openday_exit%
