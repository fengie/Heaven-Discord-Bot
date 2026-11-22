param([Parameter(Mandatory=$true)][AllowNull()][object]$AppUpdatePolicy)

$ErrorActionPreference = 'Stop'
function Fail-Policy { throw 'TOOLBOX_PRODUCT_UPDATER_CONTRACT_INVALID' }
function Assert-PolicyBoolean {
  param([AllowNull()][object]$Value, [bool]$Expected)
  # PowerShell truthiness treats the string "false" as true.
  if ($Value -isnot [bool] -or $Value -ne $Expected) { Fail-Policy }
}

$a = $AppUpdatePolicy
if ($a -isnot [pscustomobject] -or
    $a.apiVersion -cne 'heaven.update/v1' -or
    $a.policyVersion -cne '1' -or
    $a.mode -cne 'required' -or
    $a.capability -cne 'release.autoupdate') { Fail-Policy }

Assert-PolicyBoolean -Value $a.enabledByDefault -Expected $true
Assert-PolicyBoolean -Value $a.exceptionPolicy.implicitExemptionsAllowed -Expected $false
Assert-PolicyBoolean -Value $a.exceptionPolicy.requiresExplicitReviewedException -Expected $true

foreach ($key in @('signedMetadata','artifactDigest','publisherIdentity')) {
  Assert-PolicyBoolean -Value $a.integrity.$key -Expected $true
}
foreach ($key in @('stageBeforeReplace','verifyBeforeInstall','atomicHandoff',
                    'rollbackRequired','interruptedUpdateRecovery','installedIdentityVerification')) {
  Assert-PolicyBoolean -Value $a.transaction.$key -Expected $true
}
foreach ($key in @('updaterOwnedStagingOnly','cleanupAfterSuccess','cleanupAfterFailure','cleanupOnStartup')) {
  Assert-PolicyBoolean -Value $a.hygiene.$key -Expected $true
}
$maxAge = $a.hygiene.maxStagingAgeHours
if (($maxAge -isnot [int] -and $maxAge -isnot [long]) -or
    $maxAge -lt 1 -or $maxAge -gt 24) { Fail-Policy }

foreach ($key in @('backgroundNoConsole','noFocusSteal','visibleStatus')) {
  Assert-PolicyBoolean -Value $a.runtime.$key -Expected $true
}
# This child is a server-only product; changes to its delivery target require
# deliberate product review, not a silent policy-file bypass.
if ($a.targets -isnot [array] -or $a.targets.Count -ne 1 -or
    $a.targets[0].target -cne 'server' -or
    $a.targets[0].delivery -cne 'atomic-deployment') { Fail-Policy }
foreach ($key in @('checkOnStartup','backgroundChecks','manualCheck','settingsToggle')) {
  Assert-PolicyBoolean -Value $a.targets[0].$key -Expected $false
}
'HEAVEN_BOT_APP_UPDATE_POLICY_OK'
