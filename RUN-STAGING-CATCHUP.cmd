@echo off
setlocal
title OpenDay Staging Database Catch-up

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release\Invoke-OwnerStagingCatchup.ps1"
set "openday_exit=%ERRORLEVEL%"

echo.
if "%openday_exit%"=="0" (
  echo OpenDay Staging catch-up finished successfully.
) else (
  echo OpenDay Staging catch-up stopped with an error.
  echo Do not run it again. Send the error text to Codex.
)
echo.
pause
exit /b %openday_exit%