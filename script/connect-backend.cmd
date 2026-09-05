@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0connect-backend.ps1" %*
