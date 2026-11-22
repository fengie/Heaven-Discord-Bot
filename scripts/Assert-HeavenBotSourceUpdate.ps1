param([Parameter(Mandatory = $true)] [AllowNull()] [object]$SourceUpdate)

$ErrorActionPreference = 'Stop'
if (-not $SourceUpdate.required -or $SourceUpdate.strategy -cne 'ff-only') {
  throw 'TOOLBOX_SOURCE_UPDATE_CONTRACT_INVALID'
}
'HEAVEN_BOT_SOURCE_UPDATE_POLICY_OK'
