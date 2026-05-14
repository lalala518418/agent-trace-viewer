param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173,
  [string]$HostAddr = '127.0.0.1',
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

  # 先找仓库内 .venv，再兼容当前工作区把 .venv 放在上一级目录的布局。
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

  throw '未找到可用的 Python 解释器。请先创建 .venv，或通过 -PythonExe 显式传入路径。'
}

function Resolve-NpmCommand {
  foreach ($commandName in @('npm.cmd', 'npm')) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw '未找到 npm。请先安装 Node.js LTS，并确保 npm 在 PATH 中可用。'
}

function Start-WindowProcess {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$CommandLine,
    [switch]$PreviewOnly
  )

  $windowCommand = "Set-Location '$WorkingDirectory'; `$HostAddr.UI.RawUI.WindowTitle = '$Title'; $CommandLine"

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

Write-Step "仓库根目录: $repoRoot"
Write-Step "后端目录: $backendDir"
Write-Step "前端目录: $frontendDir"
Write-Step "Python: $($pythonLaunchConfig.FilePath)"
Write-Step "npm: $npmCommand"

if ($InstallDeps) {
  Write-Step '开始安装后端依赖。这样做是为了让体验者首次启动时不需要手动补 pip install。'
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
  Write-Step '开始准备前端依赖。默认在缺少 node_modules 时自动补安装，避免第一次启动直接失败。'
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

$backendRunArgs = @($pythonLaunchConfig.PrefixArgs + @('-m', 'uvicorn', 'app.main:app', '--reload', '--host', $HostAddr, '--port', "$BackendPort"))
$frontendRunArgs = @('run', 'dev', '--', '--host', $HostAddr, '--port', "$FrontendPort")

$backendCommand = Format-Invocation -FilePath $pythonLaunchConfig.FilePath -Arguments $backendRunArgs
$frontendCommand = Format-Invocation -FilePath $npmCommand -Arguments $frontendRunArgs

$backendProcess = Start-WindowProcess -Title 'Agent Trace Viewer Backend' -WorkingDirectory $backendDir -CommandLine $backendCommand -PreviewOnly:$DryRun
$frontendProcess = Start-WindowProcess -Title 'Agent Trace Viewer Frontend' -WorkingDirectory $frontendDir -CommandLine $frontendCommand -PreviewOnly:$DryRun

if (-not $NoBrowser) {
  $frontendUrl = "http://${Host}:$FrontendPort"

  if ($DryRun) {
    Write-Step "browser -> $frontendUrl"
  }
  else {
    Start-Process $frontendUrl | Out-Null
  }
}

if (-not $DryRun) {
  Write-Step "后端已在新窗口启动，PID=$($backendProcess.Id)"
  Write-Step "前端已在新窗口启动，PID=$($frontendProcess.Id)"
}
