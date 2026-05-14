@echo off
setlocal
powershell.exe -ExecutionPolicy Bypass -File "%~dp0start-demo-en.ps1" %*
