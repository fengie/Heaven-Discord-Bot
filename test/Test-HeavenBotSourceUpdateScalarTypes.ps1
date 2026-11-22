# Regress the actual child validator against JSON input, never PowerShell-cast
# synthetic booleans. Runs on both pwsh and Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$validator = Join-Path $PSScriptRoot '../scripts/Assert-HeavenBotSourceUpdate.ps1'
$cases = @(
  @{ name='boolean true lower bound'; required='true'; interval='1'; strategy='ff-only'; accept=$true }
  @{ name='boolean true upper bound'; required='true'; interval='60'; strategy='ff-only'; accept=$true }
  @{ name='boolean false'; required='false'; interval='1'; strategy='ff-only'; accept=$false }
  @{ name='string false'; required='"false"'; interval='1'; strategy='ff-only'; accept=$false }
  @{ name='string true'; required='"true"'; interval='1'; strategy='ff-only'; accept=$false }
  @{ name='integer required'; required='1'; interval='1'; strategy='ff-only'; accept=$false }
  @{ name='null required'; required='null'; interval='1'; strategy='ff-only'; accept=$false }
  @{ name='array required'; required='[true]'; interval='1'; strategy='ff-only'; accept=$false }
  @{ name='object required'; required='{}'; interval='1'; strategy='ff-only'; accept=$false }
  @{ name='missing required'; required=$null; interval='1'; strategy='ff-only'; accept=$false }
  @{ name='string interval'; required='true'; interval='"1"'; strategy='ff-only'; accept=$false }
  @{ name='float interval'; required='true'; interval='1.5'; strategy='ff-only'; accept=$false }
  @{ name='zero interval'; required='true'; interval='0'; strategy='ff-only'; accept=$false }
  @{ name='too long interval'; required='true'; interval='61'; strategy='ff-only'; accept=$false }
  @{ name='null interval'; required='true'; interval='null'; strategy='ff-only'; accept=$false }
  @{ name='boolean interval'; required='true'; interval='true'; strategy='ff-only'; accept=$false }
  @{ name='array interval'; required='true'; interval='[]'; strategy='ff-only'; accept=$false }
  @{ name='object interval'; required='true'; interval='{}'; strategy='ff-only'; accept=$false }
  @{ name='missing interval'; required='true'; interval=$null; strategy='ff-only'; accept=$false }
  @{ name='incorrect strategy'; required='true'; interval='1'; strategy='force'; accept=$false }
)
$valid = 0
$invalid = 0
foreach ($case in $cases) {
  $memberRequired = if ($null -eq $case.required) { '' } else { '"required":' + $case.required + ',' }
  $memberInterval = if ($null -eq $case.interval) { '' } else { ',"poll_interval_minutes":' + $case.interval }
  $json = '{"source_update":{' + $memberRequired + '"strategy":"' + $case.strategy + '"' + $memberInterval + '}}'
  $source = ($json | ConvertFrom-Json).source_update
  $failure = $null
  try { & $validator -SourceUpdate $source | Out-Null }
  catch { $failure = $_.Exception.Message }
  if ($case.accept) {
    if ($failure) { throw ('SOURCE_UPDATE_VALID_REJECTED: ' + $case.name + ' ' + $failure) }
    $valid++
  } else {
    if ($failure -ne 'TOOLBOX_SOURCE_UPDATE_CONTRACT_INVALID') {
      throw ('SOURCE_UPDATE_INVALID_ACCEPTED_OR_WRONG_ERROR: ' + $case.name + ' ' + $failure)
    }
    $invalid++
  }
}
"SOURCE_UPDATE_SCALAR_TYPES_PASSED valid=$valid invalid=$invalid"
