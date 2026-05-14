param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173,
  [string]$BindHost = '127.0.0.1',
  [string]$PythonExe = '',
  [switch]$InstallDeps,
  [switch]$NoBrowser,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)

  Write-Host "[agent-trace-viewer] $Message"
}

function Format-Invocation {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  $escapedArguments = foreach ($argument in $Arguments) {
    if ($null -eq $argument) {
      continue
    }

    if ($argument -match '[\s"]') {
      '"' + ($argument -replace '"', '`"') + '"'
    }
    else {
      $argument
    }
  }

  "& '$FilePath' $($escapedArguments -join ' ')"
}

function Resolve-PythonLaunchConfig {
  param(
    [string]$RepoRoot,
    [string]$RequestedPython
  )

  $candidates = @()

  if ($RequestedPython) {
    $candidates += $RequestedPython
  }

  # Prefer a repo-local .venv first, then fall back to the parent workspace layout.
  $candidates += Join-Path $RepoRoot '.venv\Scripts\python.exe'
  $candidates += Join-Path (Split-Path $RepoRoot -Parent) '.venv\Scripts\python.exe'

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return @{
        FilePath = (Resolve-Path $candidate).Path
        PrefixArgs = @()
      }
    }
  }

  $pyCommand = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($pyCommand) {
    return @{
      FilePath = $pyCommand.Source
      PrefixArgs = @('-3.11')
    }
  }

  $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($pythonCommand) {
    return @{
      FilePath = $pythonCommand.Source
      PrefixArgs = @()
    }
  }

  throw 'No Python interpreter was found. Create a .venv first or pass -PythonExe explicitly.'
}

function Resolve-NpmCommand {
  $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $command) {
    $command = Get-Command npm -ErrorAction SilentlyContinue
  }

  if ($command) {
    return $command.Source
  }

  throw 'npm was not found. Install Node.js LTS and make sure npm is available on PATH.'
}

function Start-WindowProcess {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$CommandLine,
    [switch]$PreviewOnly
  )

  $windowCommand = "Set-Location '$WorkingDirectory'; `$Host.UI.RawUI.WindowTitle = '$Title'; $CommandLine"

  if ($PreviewOnly) {
    Write-Step "$Title -> $windowCommand"
    return $null
  }

  Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    $windowCommand
  ) -PassThru
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$frontendNodeModules = Join-Path $frontendDir 'node_modules'

$pythonLaunchConfig = Resolve-PythonLaunchConfig -RepoRoot $repoRoot -RequestedPython $PythonExe
$npmCommand = Resolve-NpmCommand

Write-Step "Repo root: $repoRoot"
Write-Step "Backend dir: $backendDir"
Write-Step "Frontend dir: $frontendDir"
Write-Step "Python: $($pythonLaunchConfig.FilePath)"
Write-Step "npm: $npmCommand"

if ($InstallDeps) {
  Write-Step 'Installing backend dependencies so a first-time reviewer can launch without a manual pip install step.'
  $backendInstallArgs = @($pythonLaunchConfig.PrefixArgs + @('-m', 'pip', 'install', '-r', 'requirements.txt'))
  if ($DryRun) {
    Write-Step ("backend install -> " + (Format-Invocation -FilePath $pythonLaunchConfig.FilePath -Arguments $backendInstallArgs))
  }
  else {
    Push-Location $backendDir
    try {
      & $pythonLaunchConfig.FilePath @($pythonLaunchConfig.PrefixArgs + @('-m', 'pip', 'install', '-r', 'requirements.txt'))
    }
    finally {
      Pop-Location
    }
  }
}

if ($InstallDeps -or -not (Test-Path $frontendNodeModules)) {
  Write-Step 'Preparing frontend dependencies. The script auto-runs npm install when node_modules is missing.'
  if ($DryRun) {
    Write-Step ("frontend install -> " + (Format-Invocation -FilePath $npmCommand -Arguments @('install')))
  }
  else {
    Push-Location $frontendDir
    try {
      & $npmCommand install
    }
    finally {
      Pop-Location
    }
  }
}

$backendRunArgs = @($pythonLaunchConfig.PrefixArgs + @('-m', 'uvicorn', 'app.main:app', '--reload', '--host', $BindHost, '--port', "$BackendPort"))
$frontendRunArgs = @('run', 'dev', '--', '--host', $BindHost, '--port', "$FrontendPort")

$backendCommand = Format-Invocation -FilePath $pythonLaunchConfig.FilePath -Arguments $backendRunArgs
$frontendCommand = Format-Invocation -FilePath $npmCommand -Arguments $frontendRunArgs

$backendProcess = Start-WindowProcess -Title 'Agent Trace Viewer Backend' -WorkingDirectory $backendDir -CommandLine $backendCommand -PreviewOnly:$DryRun
$frontendProcess = Start-WindowProcess -Title 'Agent Trace Viewer Frontend' -WorkingDirectory $frontendDir -CommandLine $frontendCommand -PreviewOnly:$DryRun

if (-not $NoBrowser) {
  $frontendUrl = "http://${BindHost}:$FrontendPort"

  if ($DryRun) {
    Write-Step "browser -> $frontendUrl"
  }
  else {
    Start-Process $frontendUrl | Out-Null
  }
}

if (-not $DryRun) {
  Write-Step "Backend started in a new window, PID=$($backendProcess.Id)"
  Write-Step "Frontend started in a new window, PID=$($frontendProcess.Id)"
}