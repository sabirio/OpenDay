@echo off
setlocal
title OpenDay Production Database Connection Test

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release\Invoke-OwnerStagingCatchup.ps1" -Target production -ConnectionTestOnly -SuccessMarker "PRODUCTION_CONNECTION=PASS"
set "openday_exit=%ERRORLEVEL%"

echo.
if "%openday_exit%"=="0" (
  echo OpenDay Production connection test finished successfully.
) else (
  echo OpenDay Production connection test failed.
  echo No database changes were attempted. Send the error text to Codex.
)
echo.
pause
exit /b %openday_exit%
