param([Parameter(Mandatory = $true)] [AllowNull()] [object]$SourceUpdate)

$ErrorActionPreference = 'Stop'
# ConvertFrom-Json must produce a real object with a literal Boolean true.
# PowerShell truthiness turns the JSON string "false" into true, so never cast.
if ($SourceUpdate -isnot [pscustomobject] -or
    $SourceUpdate.required -isnot [bool] -or
    $SourceUpdate.required -ne $true -or
    $SourceUpdate.strategy -cne 'ff-only' -or
    $SourceUpdate.controller -isnot [string] -or
    $SourceUpdate.controller -cne 'heaven-toolbox/repo-autoupdate') {
  throw 'TOOLBOX_SOURCE_UPDATE_CONTRACT_INVALID'
}
# Do not coerce quoted JSON strings, floats or Booleans into an interval.
$interval = $SourceUpdate.poll_interval_minutes
if (($interval -isnot [int] -and $interval -isnot [long]) -or
    $interval -lt 1 -or $interval -gt 60) {
  throw 'TOOLBOX_SOURCE_UPDATE_CONTRACT_INVALID'
}
'HEAVEN_BOT_SOURCE_UPDATE_POLICY_OK'
