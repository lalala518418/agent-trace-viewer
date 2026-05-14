@echo off
setlocal

REM Thin wrapper so reviewers can double-click smoke-check without typing PowerShell arguments.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0smoke-check.ps1" %*