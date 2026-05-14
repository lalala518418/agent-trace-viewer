param(
  [string]$BackendBaseUrl = 'http://127.0.0.1:8000',
  [string]$FrontendUrl = 'http://127.0.0.1:5173',
  [int]$TimeoutSeconds = 20,
  [switch]$SkipValidationRoute
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)

  Write-Host "[smoke-check] $Message"
}

function Invoke-TextCheck {
  param(
    [string]$Url,
    [string]$ExpectedSnippet,
    [string]$Label
  )

  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "$Label returned unexpected HTTP status $($response.StatusCode)."
  }

  if ($ExpectedSnippet -and ($response.Content -notlike "*$ExpectedSnippet*")) {
    throw "$Label did not contain expected text: $ExpectedSnippet"
  }

  Write-Step "$Label OK ($($response.StatusCode))"
}

function Invoke-JsonCheck {
  param(
    [string]$Url,
    [string]$Label,
    [scriptblock]$Assertion
  )

  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "$Label returned unexpected HTTP status $($response.StatusCode)."
  }

  $payload = $response.Content | ConvertFrom-Json
  & $Assertion $payload
  Write-Step "$Label OK ($($response.StatusCode))"
}

Write-Step "Frontend URL: $FrontendUrl"
Write-Step "Backend URL: $BackendBaseUrl"

Invoke-TextCheck -Url $FrontendUrl -ExpectedSnippet 'Agent Trace Viewer' -Label 'Frontend root'
Invoke-TextCheck -Url "$BackendBaseUrl/docs" -ExpectedSnippet 'FastAPI' -Label 'Backend docs'

Invoke-JsonCheck -Url "$BackendBaseUrl/api/traces" -Label 'Trace list API' -Assertion {
  param($payload)
  if ($null -eq $payload) {
    throw 'Trace list payload was null.'
  }
}

Invoke-JsonCheck -Url "$BackendBaseUrl/api/prompt-versions" -Label 'Prompt registry API' -Assertion {
  param($payload)
  if ($null -eq $payload) {
    throw 'Prompt registry payload was null.'
  }
}

if (-not $SkipValidationRoute) {
  Invoke-JsonCheck -Url "$BackendBaseUrl/api/integrations/usage/validation?time_range_days=7" -Label 'Usage validation API' -Assertion {
    param($payload)
    if ($null -eq $payload.checks) {
      throw 'Usage validation payload did not include checks.'
    }

    if ($null -eq $payload.supported_check_count) {
      throw 'Usage validation payload did not include supported_check_count.'
    }
  }
}

Write-Step 'Smoke check completed successfully.'