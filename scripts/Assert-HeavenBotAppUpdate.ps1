param([Parameter(Mandatory=$true)][AllowNull()][object]$AppUpdatePolicy)

$ErrorActionPreference = 'Stop'
$a = $AppUpdatePolicy
# Deliberately preserved old behavior for a source-bound RED regression.
if ($a.apiVersion -cne 'heaven.update/v1' -or $a.mode -cne 'required' -or
    -not $a.transaction.rollbackRequired -or -not $a.integrity.artifactDigest) {
  throw 'TOOLBOX_PRODUCT_UPDATER_CONTRACT_INVALID'
}
'HEAVEN_BOT_APP_UPDATE_POLICY_OK'
