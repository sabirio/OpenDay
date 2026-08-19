@echo off
setlocal
title OpenDay Staging Security 147

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release\Invoke-OwnerStagingCatchup.ps1" -ArtifactPath "%~dp0scripts\releases\openday-security-147\staging-security-147.sql" -SuccessMarker "STAGING_SECURITY_147=PASS"
set "openday_exit=%ERRORLEVEL%"

echo.
if "%openday_exit%"=="0" (
  echo OpenDay Staging security migration 147 finished successfully.
) else (
  echo OpenDay Staging security migration 147 stopped with an error.
  echo Do not run it again. Send the error text to Codex.
)
echo.
pause
exit /b %openday_exit%
