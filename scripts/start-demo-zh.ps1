param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173,
  [string]$BindHost = '127.0.0.1',
  [string]$PythonExe = '',
  [switch]$InstallDeps,
  [switch]$NoBrowser,
  [switch]$DryRun
)

& "$PSScriptRoot\start-demo.ps1" @PSBoundParameters -Language zh
