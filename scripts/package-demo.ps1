param(
  [string]$OutputRoot = 'dist\reviewer-package',
  [string]$PackageName = 'agent-trace-viewer-reviewer',
  [string]$PythonExe = '',
  [switch]$SkipBuild,
  [switch]$NoZip,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)

  Write-Host "[package-demo] $Message"
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

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Copy-PathIfPresent {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (-not (Test-Path $Source)) {
    return
  }

  $parentDir = Split-Path $Destination -Parent
  if ($parentDir) {
    Ensure-Directory -Path $parentDir
  }

  Copy-Item -Path $Source -Destination $Destination -Recurse -Force
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$pythonLaunchConfig = Resolve-PythonLaunchConfig -RepoRoot $repoRoot -RequestedPython $PythonExe
$npmCommand = Resolve-NpmCommand

$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$frontendNodeModules = Join-Path $frontendDir 'node_modules'
$resolvedOutputRoot = if ([System.IO.Path]::IsPathRooted($OutputRoot)) { $OutputRoot } else { Join-Path $repoRoot $OutputRoot }
$packageRoot = Join-Path $resolvedOutputRoot $PackageName
$zipPath = Join-Path $resolvedOutputRoot ("$PackageName.zip")

Write-Step "Repo root: $repoRoot"
Write-Step "Output root: $resolvedOutputRoot"
Write-Step "Package root: $packageRoot"
Write-Step "Python: $($pythonLaunchConfig.FilePath)"
Write-Step "npm: $npmCommand"

if ($DryRun) {
  if (-not $SkipBuild) {
    if (-not (Test-Path $frontendNodeModules)) {
      Write-Step ("frontend install -> " + (Format-Invocation -FilePath $npmCommand -Arguments @('install')))
    }

    Write-Step ("frontend build -> " + (Format-Invocation -FilePath $npmCommand -Arguments @('run', 'build')))
  }

  Write-Step "package copy -> backend, frontend, docs, examples, scripts, README.md"
  if (-not $NoZip) {
    Write-Step "zip -> $zipPath"
  }
  return
}

Ensure-Directory -Path $resolvedOutputRoot

if (Test-Path $packageRoot) {
  Remove-Item -Path $packageRoot -Recurse -Force
}

if ((-not $NoZip) -and (Test-Path $zipPath)) {
  Remove-Item -Path $zipPath -Force
}

if (-not $SkipBuild) {
  if (-not (Test-Path $frontendNodeModules)) {
    Write-Step 'Running npm install because frontend node_modules is missing.'
    Push-Location $frontendDir
    try {
      & $npmCommand install
    }
    finally {
      Pop-Location
    }
  }

  Write-Step 'Running frontend production build so the package includes the latest dist assets.'
  Push-Location $frontendDir
  try {
    & $npmCommand run build
  }
  finally {
    Pop-Location
  }
}

Ensure-Directory -Path $packageRoot

# Copy a reviewer-friendly subset of the repo so the zip can be shared without caches or local databases.
Copy-PathIfPresent -Source (Join-Path $backendDir 'app') -Destination (Join-Path $packageRoot 'backend\app')
Copy-PathIfPresent -Source (Join-Path $backendDir 'requirements.txt') -Destination (Join-Path $packageRoot 'backend\requirements.txt')
Copy-PathIfPresent -Source (Join-Path $backendDir '.env.example') -Destination (Join-Path $packageRoot 'backend\.env.example')

Copy-PathIfPresent -Source (Join-Path $frontendDir 'src') -Destination (Join-Path $packageRoot 'frontend\src')
Copy-PathIfPresent -Source (Join-Path $frontendDir 'dist') -Destination (Join-Path $packageRoot 'frontend\dist')
Copy-PathIfPresent -Source (Join-Path $frontendDir 'package.json') -Destination (Join-Path $packageRoot 'frontend\package.json')
Copy-PathIfPresent -Source (Join-Path $frontendDir 'package-lock.json') -Destination (Join-Path $packageRoot 'frontend\package-lock.json')
Copy-PathIfPresent -Source (Join-Path $frontendDir 'index.html') -Destination (Join-Path $packageRoot 'frontend\index.html')
Copy-PathIfPresent -Source (Join-Path $frontendDir '.env.example') -Destination (Join-Path $packageRoot 'frontend\.env.example')
Copy-PathIfPresent -Source (Join-Path $frontendDir 'tsconfig.json') -Destination (Join-Path $packageRoot 'frontend\tsconfig.json')
Copy-PathIfPresent -Source (Join-Path $frontendDir 'tsconfig.app.json') -Destination (Join-Path $packageRoot 'frontend\tsconfig.app.json')
Copy-PathIfPresent -Source (Join-Path $frontendDir 'tsconfig.node.json') -Destination (Join-Path $packageRoot 'frontend\tsconfig.node.json')
Copy-PathIfPresent -Source (Join-Path $frontendDir 'vite.config.ts') -Destination (Join-Path $packageRoot 'frontend\vite.config.ts')

Copy-PathIfPresent -Source (Join-Path $repoRoot 'docs\assets\screenshots') -Destination (Join-Path $packageRoot 'docs\assets\screenshots')
Copy-PathIfPresent -Source (Join-Path $repoRoot 'docs\frontend-walkthrough.md') -Destination (Join-Path $packageRoot 'docs\frontend-walkthrough.md')
Copy-PathIfPresent -Source (Join-Path $repoRoot 'docs\windows-setup.md') -Destination (Join-Path $packageRoot 'docs\windows-setup.md')
Copy-PathIfPresent -Source (Join-Path $repoRoot 'docs\provider-pricing-reference.md') -Destination (Join-Path $packageRoot 'docs\provider-pricing-reference.md')
Copy-PathIfPresent -Source (Join-Path $repoRoot 'examples\sample_trace.json') -Destination (Join-Path $packageRoot 'examples\sample_trace.json')

Copy-PathIfPresent -Source (Join-Path $repoRoot 'scripts\start-demo.ps1') -Destination (Join-Path $packageRoot 'scripts\start-demo.ps1')
Copy-PathIfPresent -Source (Join-Path $repoRoot 'scripts\start-demo.cmd') -Destination (Join-Path $packageRoot 'scripts\start-demo.cmd')
Copy-PathIfPresent -Source (Join-Path $repoRoot 'scripts\smoke-check.ps1') -Destination (Join-Path $packageRoot 'scripts\smoke-check.ps1')
Copy-PathIfPresent -Source (Join-Path $repoRoot 'scripts\smoke-check.cmd') -Destination (Join-Path $packageRoot 'scripts\smoke-check.cmd')

Copy-PathIfPresent -Source (Join-Path $repoRoot 'README.md') -Destination (Join-Path $packageRoot 'README.md')
Copy-PathIfPresent -Source (Join-Path $repoRoot '.gitignore') -Destination (Join-Path $packageRoot '.gitignore')

$packageNotes = @(
  '# Reviewer Package',
  '',
  'This package was generated by scripts/package-demo.ps1.',
  '',
  'Suggested entry points:',
  '- Run scripts/start-demo.ps1 -InstallDeps for a first launch.',
  '- Run scripts/smoke-check.ps1 after startup to verify frontend and backend health.',
  '- Read docs/frontend-walkthrough.md for the recommended demo flow.'
)
Set-Content -Path (Join-Path $packageRoot 'PACKAGE-README.md') -Value $packageNotes -Encoding ASCII

if (-not $NoZip) {
  Write-Step 'Creating zip archive for sharing.'
  Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -Force
}

Write-Step 'Package generation completed.'
Write-Step "Package root ready at: $packageRoot"
if (-not $NoZip) {
  Write-Step "Zip archive ready at: $zipPath"
}