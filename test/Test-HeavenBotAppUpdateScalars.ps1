# Use the actual child workflow validator and JSON-parsed values, not fake
# PowerShell Boolean casts. Fixture stays in memory; never alters the policy.
$ErrorActionPreference = 'Stop'
$validator = Join-Path $PSScriptRoot '../scripts/Assert-HeavenBotAppUpdate.ps1'
$baseline = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../.heaven/app-update-policy.json') -Raw -Encoding UTF8
$cases = @(
  @{name='current policy'; old=$null; replacement=$null; accept=$true}
  @{name='bounded integer cleanup'; old='"maxStagingAgeHours": 24'; replacement='"maxStagingAgeHours": 12'; accept=$true}
  @{name='rollback string false'; old='"rollbackRequired": true'; replacement='"rollbackRequired": "false"'; accept=$false}
  @{name='rollback string true'; old='"rollbackRequired": true'; replacement='"rollbackRequired": "true"'; accept=$false}
  @{name='rollback boolean false'; old='"rollbackRequired": true'; replacement='"rollbackRequired": false'; accept=$false}
  @{name='rollback missing'; old='"rollbackRequired": true'; replacement='"otherRollbackFlag": true'; accept=$false}
  @{name='artifact digest string false'; old='"artifactDigest": true'; replacement='"artifactDigest": "false"'; accept=$false}
  @{name='artifact digest boolean false'; old='"artifactDigest": true'; replacement='"artifactDigest": false'; accept=$false}
  @{name='signed metadata disabled'; old='"signedMetadata": true'; replacement='"signedMetadata": false'; accept=$false}
  @{name='publisher identity disabled'; old='"publisherIdentity": true'; replacement='"publisherIdentity": false'; accept=$false}
  @{name='atomic handoff disabled'; old='"atomicHandoff": true'; replacement='"atomicHandoff": false'; accept=$false}
  @{name='staging disabled'; old='"stageBeforeReplace": true'; replacement='"stageBeforeReplace": false'; accept=$false}
  @{name='preinstall verification disabled'; old='"verifyBeforeInstall": true'; replacement='"verifyBeforeInstall": false'; accept=$false}
  @{name='interrupted recovery disabled'; old='"interruptedUpdateRecovery": true'; replacement='"interruptedUpdateRecovery": false'; accept=$false}
  @{name='installed identity verification disabled'; old='"installedIdentityVerification": true'; replacement='"installedIdentityVerification": false'; accept=$false}
  @{name='default enablement disabled'; old='"enabledByDefault": true'; replacement='"enabledByDefault": false'; accept=$false}
  @{name='implicit exemptions enabled'; old='"implicitExemptionsAllowed": false'; replacement='"implicitExemptionsAllowed": true'; accept=$false}
  @{name='reviewed exceptions disabled'; old='"requiresExplicitReviewedException": true'; replacement='"requiresExplicitReviewedException": false'; accept=$false}
  @{name='updater staging containment disabled'; old='"updaterOwnedStagingOnly": true'; replacement='"updaterOwnedStagingOnly": false'; accept=$false}
  @{name='failure cleanup disabled'; old='"cleanupAfterFailure": true'; replacement='"cleanupAfterFailure": false'; accept=$false}
  @{name='startup cleanup disabled'; old='"cleanupOnStartup": true'; replacement='"cleanupOnStartup": false'; accept=$false}
  @{name='cleanup age as string'; old='"maxStagingAgeHours": 24'; replacement='"maxStagingAgeHours": "24"'; accept=$false}
  @{name='cleanup age disabled'; old='"maxStagingAgeHours": 24'; replacement='"maxStagingAgeHours": 0'; accept=$false}
  @{name='foreground disruption enabled'; old='"noFocusSteal": true'; replacement='"noFocusSteal": false'; accept=$false}
  @{name='server delivery disabled'; old='"delivery": "atomic-deployment"'; replacement='"delivery": "manual"'; accept=$false}
  @{name='server target removed'; old='"target": "server"'; replacement='"target": "desktop"'; accept=$false}
)
$valid = 0
$invalid = 0
foreach($case in $cases) {
  $json = $baseline
  if($null -ne $case.old) {
    if (-not $json.Contains($case.old)) { throw ('APP_UPDATE_TEST_FIXTURE_MISSING: ' + $case.name) }
    $json = $json.Replace($case.old, $case.replacement)
  }
  $value = $json | ConvertFrom-Json -ErrorAction Stop
  $failure = $null
  try { & $validator -AppUpdatePolicy $value | Out-Null }
  catch { $failure = $_.Exception.Message }
  if ($case.accept) {
    if ($failure) { throw ('APP_UPDATE_VALID_REJECTED: ' + $case.name + ' ' + $failure) }
    $valid++
  } elseif ($failure -ne 'TOOLBOX_PRODUCT_UPDATER_CONTRACT_INVALID') {
    throw ('APP_UPDATE_INVALID_ACCEPTED_OR_WRONG_ERROR: ' + $case.name + ' ' + $failure)
  } else {
    $invalid++
  }
}
"APP_UPDATE_POLICY_SCALARS_PASSED valid=$valid invalid=$invalid"
