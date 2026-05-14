@echo off
setlocal

REM Thin wrapper so reviewers can double-click packaging without typing PowerShell arguments.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0package-demo.ps1" %*