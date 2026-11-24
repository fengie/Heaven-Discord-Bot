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
  @{ name='missing controller'; required='true'; interval='1'; strategy='ff-only'; controller=$null; accept=$false }
  @{ name='foreign controller'; required='true'; interval='1'; strategy='ff-only'; controller='"other/controller"'; accept=$false }
  @{ name='null controller'; required='true'; interval='1'; strategy='ff-only'; controller='null'; accept=$false }
  @{ name='case changed controller'; required='true'; interval='1'; strategy='ff-only'; controller='"HEAVEN-TOOLBOX/repo-autoupdate"'; accept=$false }
  @{ name='array controller'; required='true'; interval='1'; strategy='ff-only'; controller='["heaven-toolbox/repo-autoupdate"]'; accept=$false }
  @{ name='boolean controller'; required='true'; interval='1'; strategy='ff-only'; controller='true'; accept=$false }
)
$valid = 0
$invalid = 0
foreach ($case in $cases) {
  $memberRequired = if ($null -eq $case.required) { '' } else { '"required":' + $case.required + ',' }
  $memberInterval = if ($null -eq $case.interval) { '' } else { ',"poll_interval_minutes":' + $case.interval }
  $memberController = if (-not $case.ContainsKey('controller')) {
    ',"controller":"heaven-toolbox/repo-autoupdate"'
  } elseif ($null -eq $case.controller) { '' } else { ',"controller":' + $case.controller }
  $json = '{"source_update":{' + $memberRequired + '"strategy":"' + $case.strategy + '"' + $memberInterval + $memberController + '}}'
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

# The existing Toolbox updater passes -RepoRoot and -ExpectedSourceSha.
# Inspect actual PowerShell binding metadata without running the host updater.
$applyCommand = Get-Command -Name (Join-Path $PSScriptRoot '../scripts/Apply-HeavenBotUpdate.ps1') -CommandType ExternalScript -ErrorAction Stop
$sourceParameter = @($applyCommand.Parameters.Values | Where-Object {
    $_.Name -ceq 'ExpectedSourceSha' -or $_.Aliases -ccontains 'ExpectedSourceSha'
})
if ($sourceParameter.Count -ne 1) { throw 'TOOLBOX_RUNTIME_APPLY_EXPECTED_SOURCE_SHA_MISSING' }
if ($sourceParameter[0].ParameterType -ne [string] -or
    ($sourceParameter[0].Name -cne 'ExpectedSha' -and $sourceParameter[0].Aliases -cnotcontains 'ExpectedSha')) {
    throw 'TOOLBOX_RUNTIME_APPLY_LEGACY_BINDING_CHANGED'
}
'TOOLBOX_RUNTIME_APPLY_PARAMETER_CONTRACT_PASSED'

# Exercise the actual update poller without invoking its top-level host effects.
# A ready log from an unverified process must not commit a transaction.
function Read-OwnedFunction([string]$Path,[string]$Name) {
    $tokens = $null; $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($Path,[ref]$tokens,[ref]$parseErrors)
    if ($parseErrors.Count -ne 0) { throw 'GATEWAY_FIXTURE_PARSE_FAILED' }
    $found = $ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $Name},$true)
    if ($null -eq $found) { throw ('GATEWAY_FIXTURE_FUNCTION_MISSING: '+$Name) }
    return [scriptblock]::Create($found.Extent.Text)
}
$applyPath = Join-Path $PSScriptRoot '../scripts/Apply-HeavenBotUpdate.ps1'
$verifyPath = Join-Path $PSScriptRoot '../scripts/Test-HeavenBotDeployment.ps1'
. (Read-OwnedFunction $applyPath 'Await-Gateway')
function Start-Sleep { param([int]$Seconds) }
function Get-ScheduledTask { param([string]$TaskName) [pscustomobject]@{State='Running'} }
function Hold([string]$Code) { throw $Code }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('heaven-bot-gateway-test-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
try {
    $repo = $fixture
    $taskName = 'FixtureOnly'
    $log = Join-Path $fixture 'bot.log'
    $candidate = 'b'*40
    $prior = 'a'*40
    $ready = @{event='discord.ready';sourceSha=$candidate;pid=1234;observedAt=[DateTimeOffset]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText($log,($ready | ConvertTo-Json -Compress))
    [void][IO.Directory]::CreateDirectory((Join-Path $fixture 'scripts'))
    $fixtureVerifier = Join-Path $fixture 'scripts/Test-HeavenBotDeployment.ps1'
    [IO.File]::WriteAllText($fixtureVerifier,@'
[CmdletBinding()]
param([string]$RepoRoot,[string]$ExpectedSourceSha,[string]$RollbackFromSha='',[int]$MaxReadyAgeSeconds=0)
$expected = Get-Content -LiteralPath (Join-Path $RepoRoot 'expected.json') -Raw | ConvertFrom-Json
if ($ExpectedSourceSha -cne $expected.source -or $RollbackFromSha -cne $expected.rollback -or $MaxReadyAgeSeconds -ne 120) { throw 'FIXTURE_WRONG_VERIFIER_ARGUMENTS' }
Get-Content -LiteralPath (Join-Path $RepoRoot 'proof.json') -Raw -ErrorAction Stop
'@)
    [IO.File]::WriteAllText((Join-Path $fixture 'expected.json'),(@{source=$candidate;rollback=''}|ConvertTo-Json -Compress))
    if (Await-Gateway -Seconds 2 -ExpectedRevision $candidate) { throw 'GATEWAY_LOG_ONLY_ACCEPTED' }
    $proof = @{schema='heaven-discord-bot/deployment-verification/v1';status='verified';source_sha=$candidate;installed_sha=$candidate;checkout_sha=$candidate;host='HEAVEN'}
    $proofFile = Join-Path $fixture 'proof.json'
    [IO.File]::WriteAllText($proofFile,($proof|ConvertTo-Json -Compress))
    if (-not (Await-Gateway -Seconds 2 -ExpectedRevision $candidate)) { throw 'GATEWAY_VALID_PROOF_REJECTED' }
    foreach ($field in @('schema','status','source_sha','installed_sha','checkout_sha','host')) {
        $wrong = $proof.Clone()
        $wrong[$field] = 'invalid'
        [IO.File]::WriteAllText($proofFile,($wrong|ConvertTo-Json -Compress))
        if (Await-Gateway -Seconds 2 -ExpectedRevision $candidate) { throw ('GATEWAY_INVALID_PROOF_ACCEPTED: '+$field) }
    }
    [IO.File]::WriteAllText($proofFile,'not-json')
    if (Await-Gateway -Seconds 2 -ExpectedRevision $candidate) { throw 'GATEWAY_MALFORMED_PROOF_ACCEPTED' }
    [IO.File]::WriteAllText((Join-Path $fixture 'expected.json'),(@{source=$prior;rollback=$candidate}|ConvertTo-Json -Compress))
    $proof.status='rollback_verified'; $proof.source_sha=$prior; $proof.installed_sha=$prior
    [IO.File]::WriteAllText($proofFile,($proof|ConvertTo-Json -Compress))
    if (-not (Await-Gateway -Seconds 2 -ExpectedRevision $prior -RollbackFromSha $candidate)) { throw 'GATEWAY_ROLLBACK_PROOF_REJECTED' }
    $proof.status='verified'
    [IO.File]::WriteAllText($proofFile,($proof|ConvertTo-Json -Compress))
    if (Await-Gateway -Seconds 2 -ExpectedRevision $prior -RollbackFromSha $candidate) { throw 'GATEWAY_WRONG_ROLLBACK_STATUS_ACCEPTED' }

    # Run the actual read-only verifier functions against a disposable Git history.
    . (Read-OwnedFunction $verifyPath 'Get-VerifiedCheckout')
    . (Read-OwnedFunction $verifyPath 'Verify-GitBlob')
    $repo = Join-Path $fixture 'git-repo'
    $app = Join-Path $fixture 'installed-app'
    [void][IO.Directory]::CreateDirectory($repo)
    [void][IO.Directory]::CreateDirectory($app)
    $hooks = Join-Path $fixture 'empty-hooks'
    [void][IO.Directory]::CreateDirectory($hooks)
    function FixtureGit([string[]]$Arguments) {
        $result = @(& git -C $repo -c core.hooksPath=$hooks -c core.autocrlf=false -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgSign=false @Arguments)
        if ($LASTEXITCODE -ne 0) { throw 'GATEWAY_FIXTURE_GIT_FAILED' }
        return ($result -join "").Trim()
    }
    [void](FixtureGit @('init','-q'))
    [IO.File]::WriteAllText((Join-Path $repo 'sample.txt'),'original')
    [void](FixtureGit @('add','sample.txt'))
    [void](FixtureGit @('commit','-qm','original'))
    $oldSha = FixtureGit @('rev-parse','HEAD')
    [IO.File]::WriteAllText((Join-Path $repo 'sample.txt'),'candidate')
    [void](FixtureGit @('add','sample.txt'))
    [void](FixtureGit @('commit','-qm','candidate'))
    $newSha = FixtureGit @('rev-parse','HEAD')
    $tree = FixtureGit @('rev-parse','HEAD^{tree}')
    $unrelated = FixtureGit @('commit-tree',$tree,'-m','unrelated')
    if ((Get-VerifiedCheckout $repo $newSha '') -cne $newSha -or
        (Get-VerifiedCheckout $repo $oldSha $newSha) -cne $newSha) { throw 'GATEWAY_VALID_CHECKOUT_REJECTED' }
    foreach ($case in @(@{source=$oldSha;from=''},@{source=$unrelated;from=$newSha},@{source=$newSha;from=$newSha},@{source=$oldSha;from=$unrelated})) {
        $failed=$false
        try { [void](Get-VerifiedCheckout $repo $case.source $case.from) } catch { $failed=$true }
        if (-not $failed) { throw 'GATEWAY_UNBOUND_HISTORY_ACCEPTED' }
    }
    $ExpectedSourceSha=$oldSha
    [IO.File]::WriteAllText((Join-Path $app 'sample.txt'),'original')
    Verify-GitBlob 'sample.txt'
    [IO.File]::WriteAllText((Join-Path $app 'sample.txt'),'candidate')
    $failure=$null
    try { Verify-GitBlob 'sample.txt' } catch { $failure=$_.Exception.Message }
    if ($failure -cne 'INSTALLED_BLOB_DRIFT') { throw 'GATEWAY_ROLLBACK_WRONG_BLOB_ACCEPTED' }
    'TOOLBOX_GATEWAY_ACCEPTANCE_REGRESSIONS_PASSED'
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
