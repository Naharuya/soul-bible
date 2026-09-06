@echo off
setlocal
cd /d "%~dp0"
echo.
echo ==========================================
echo   RAMI MVP v0.3.0 - Android APK Builder
echo ==========================================
echo.
where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell could not be found.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_android.ps1"
if errorlevel 1 (
  echo.
  echo [FAILED] APK build did not finish.
  pause
  exit /b 1
)
echo.
echo [DONE] RAMI APK is ready.
echo %~dp0RAMI-v0.3.0-release.apk
echo.
pause
