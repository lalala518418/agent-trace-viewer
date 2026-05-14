@echo off
setlocal

REM Thin wrapper so reviewers can double-click the launcher without typing PowerShell arguments.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0start-demo.ps1" %*