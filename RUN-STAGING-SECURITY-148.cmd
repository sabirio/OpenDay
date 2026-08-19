@echo off
setlocal
title OpenDay Staging Security 148

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release\Invoke-OwnerStagingCatchup.ps1" -ArtifactPath "%~dp0scripts\releases\openday-security-148\staging-security-148.sql" -SuccessMarker "STAGING_SECURITY_148=PASS"
set "openday_exit=%ERRORLEVEL%"

echo.
if "%openday_exit%"=="0" (
  echo OpenDay Staging security migration 148 finished successfully.
) else (
  echo OpenDay Staging security migration 148 stopped with an error.
  echo Do not run it again. Send the error text to Codex.
)
echo.
pause
exit /b %openday_exit%
