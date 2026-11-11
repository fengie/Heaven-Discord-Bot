#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepoRoot = (Join-Path $PSScriptRoot '..'),
    [string]$ExpectedSha = '',
    [switch]$DiagnosticsOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Fail([string]$Code) { throw $Code }

# This is an adapter for the *existing* Heaven Toolbox repo updater, not a
# competing scheduler or a privileged remote command receiver.
if ([Environment]::MachineName.ToUpperInvariant() -cne 'HEAVEN') { Fail 'HEAVEN1_REQUIRED' }
if (-not [Environment]::Is64BitProcess -or -not $env:LOCALAPPDATA) { Fail 'HEAVEN1_NATIVE_USER_REQUIRED' }
$repo = (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
$root = Join-Path $env:LOCALAPPDATA 'HeavenDiscordBot'
$taskName = 'Heaven Discord Bot'
$runner = Join-Path $root 'Install-HeavenBot.ps1'
$node = Join-Path $root 'node-v24.17.0-win-x64\node.exe'
$npm = Join-Path $root 'node-v24.17.0-win-x64\node_modules\npm\bin\npm-cli.js'
$pointer = Join-Path $root 'source.sha'
$log = Join-Path $root 'bot.log'
$cli = Join-Path $repo 'scripts\update-release-cli.mjs'

function Git([string[]]$Arguments) {
    $result = @(& git -C $repo @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { Fail 'SOURCE_GIT_FAILED' }
    return ($result -join [Environment]::NewLine).Trim()
}
function NodeCli([string[]]$Arguments) {
    $raw = @(& $node $cli @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { Fail 'BOT_UPDATE_OPERATION_FAILED' }
    try {
        $receipt = ($raw | Select-Object -Last 1) | ConvertFrom-Json -ErrorAction Stop
        if ([string]$receipt.schema -cne 'heaven-discord-bot/update-operation/v1') { Fail 'BOT_UPDATE_RECEIPT_INVALID' }
        return $receipt
    } catch { Fail 'BOT_UPDATE_RECEIPT_INVALID' }
}
function Verify-Task {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $task) { Fail 'BOT_TASK_NOT_INSTALLED' }
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $name = $current.Name
    $sid = $current.User.Value
    $exe = Join-Path $PSHOME 'powershell.exe'
    $args = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '" -Mode Run'
    $actions = @($task.Actions)
    if ($actions.Count -ne 1 -or [string]$actions[0].Execute -ine $exe -or
        [string]$actions[0].Arguments -cne $args -or
        [string]$task.Principal.UserId -notin @($name,$sid) -or
        [string]$task.Principal.LogonType -cne 'Interactive') { Fail 'FOREIGN_BOT_TASK_HOLD' }
    if ([string]$task.State -eq 'Disabled') { Fail 'BOT_TASK_DISABLED' }
    return $task
}
function Await-TaskState([string]$State,[int]$Seconds) {
    for($i=0;$i -lt $Seconds;$i+=2) {
        Start-Sleep -Seconds 2
        if ([string](Get-ScheduledTask -TaskName $taskName).State -ceq $State) { return }
    }
    Fail 'BOT_TASK_STATE_UNCONFIRMED'
}
function Await-Gateway([int]$Seconds) {
    for($i=0;$i -lt $Seconds;$i+=2) {
        Start-Sleep -Seconds 2
        $state = [string](Get-ScheduledTask -TaskName $taskName).State
        if ($state -eq 'Running' -and (Test-Path -LiteralPath $log -PathType Leaf)) {
            if (Select-String -LiteralPath $log -Pattern '"event":"discord.ready"' -SimpleMatch -Quiet -ErrorAction SilentlyContinue) {
                return $true
            }
        }
    }
    return $false
}
function BotOwnedTaskStop {
    $task = Verify-Task
    if ([string]$task.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
        Await-TaskState -State 'Ready' -Seconds 30
    }
}
function BotOwnedTaskStart {
    [void](Verify-Task)
    if (Test-Path -LiteralPath $log -PathType Leaf) { Clear-Content -LiteralPath $log -ErrorAction Stop }
    Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
}
$mutex = [Threading.Mutex]::new($false,'Local\HeavenDiscordBotUpdate')
$locked = $false
$stage = $null
$switched = $false
try {
    $locked = $mutex.WaitOne(0)
    if (-not $locked) { Fail 'BOT_UPDATE_BUSY' }
    if (-not (Test-Path -LiteralPath $root -PathType Container) -or
        -not (Test-Path -LiteralPath $node -PathType Leaf) -or
        -not (Test-Path -LiteralPath $npm -PathType Leaf) -or
        -not (Test-Path -LiteralPath $runner -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $root 'credentials.dpapi.json') -PathType Leaf) -or
        -not (Test-Path -LiteralPath $pointer -PathType Leaf)) { Fail 'BOT_RUNTIME_NOT_INSTALLED' }
    [void](Verify-Task)
    $origin = Git @('remote','get-url','origin')
    if ($origin -notin @('https://github.com/fengie/Heaven-Discord-Bot','https://github.com/fengie/Heaven-Discord-Bot.git','git@github.com:fengie/Heaven-Discord-Bot.git')) { Fail 'SOURCE_ORIGIN_UNVERIFIED' }
    if ((Git @('branch','--show-current')) -cne 'main' -or (Git @('status','--porcelain','--untracked-files=normal'))) { Fail 'SOURCE_NOT_CLEAN_MAIN' }
    $revision = (Git @('rev-parse','HEAD')).ToLowerInvariant()
    if ($revision -notmatch '^[a-f0-9]{40}$' -or ($ExpectedSha -and $revision -cne $ExpectedSha)) { Fail 'SOURCE_REVISION_UNVERIFIED' }

    $currentReceipt = NodeCli @('current',$root)
    $old = [string]$currentReceipt.revision
    if ($DiagnosticsOnly) {
        [pscustomobject]@{schema='heaven-discord-bot/update-adapter/v1';status='OBSERVED';host='HEAVEN';installed_sha=$old;source_sha=$revision;applied=$false} | ConvertTo-Json -Compress
        exit 0
    }
    # Fail closed on the consumer's real executable source-admission gate.
    & $node (Join-Path $repo 'scripts\report-release-readiness.mjs') --require-ready | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'TOOLBOX_SOURCE_ADMISSION_HOLD' }
    if ($old -ceq $revision) {
        [pscustomobject]@{schema='heaven-discord-bot/update-adapter/v1';status='CURRENT';host='HEAVEN';installed_sha=$old;source_sha=$revision;applied=$false} | ConvertTo-Json -Compress
        exit 0
    }

    # The parent repo updater is the one source-convergence authority.
    # This adapter validates the exact full checkout and never force-resets Git.
    # Authenticate the published main and its GitHub-verified signature
    # before any bot-owned process is stopped or a release is staged.
    $published = (Git @('ls-remote','origin','refs/heads/main')) -split '\s+'
    if ($published.Count -lt 2 -or $published[0].ToLowerInvariant() -cne $revision) {
        Fail 'SOURCE_MAIN_PUBLICATION_CHANGED'
    }
    $uri = 'https://api.github.com/repos/fengie/Heaven-Discord-Bot/commits/' + $revision
    $remoteCommit = Invoke-RestMethod -Uri $uri -Headers @{'User-Agent'='HeavenDiscordBot-Updater'}
    if ([string]$remoteCommit.sha -cne $revision -or $remoteCommit.commit.verification.verified -ne $true) {
        Fail 'PUBLISHER_SIGNATURE_UNVERIFIED'
    }

    $result = NodeCli @('stage',$root,$repo,$revision)
    $stage = [string]$result.stage
    if (-not $stage.StartsWith((Join-Path $root '.stage-'),[StringComparison]::OrdinalIgnoreCase)) { Fail 'STAGE_IDENTITY_UNVERIFIED' }
    $env:PATH = "$(Split-Path $node -Parent);$env:PATH"
    & $node $npm ci --prefix $stage --ignore-scripts --omit=dev --no-audit --no-fund --loglevel=error | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'STAGED_DEPENDENCIES_FAILED' }
    Push-Location $stage
    try { & $node --test | Out-Null; if ($LASTEXITCODE -ne 0) { Fail 'STAGED_TESTS_FAILED' } }
    finally { Pop-Location }
    # Re-verify installed source before stopping the owned bot.
    if ([string](NodeCli @('current',$root)).revision -cne $old) { Fail 'INSTALLED_SOURCE_MOVED' }
    BotOwnedTaskStop
    $switched = $true
    [void](NodeCli @('activate',$root,$stage,$revision))
    BotOwnedTaskStart
    if (-not (Await-Gateway -Seconds 60)) { Fail 'CANDIDATE_GATEWAY_UNVERIFIED' }
    [void](NodeCli @('confirm',$root,$revision))
    if ([string](NodeCli @('current',$root)).revision -cne $revision) { Fail 'DEPLOYMENT_SOURCE_MISMATCH' }
    [pscustomobject]@{schema='heaven-discord-bot/update-adapter/v1';status='DEPLOYED';host='HEAVEN';installed_sha=$revision;source_sha=$revision;previous_sha=$old;gateway_ready=$true} | ConvertTo-Json -Compress
} catch {
    $allowed = @('HEAVEN1_REQUIRED','HEAVEN1_NATIVE_USER_REQUIRED','BOT_RUNTIME_NOT_INSTALLED','BOT_TASK_NOT_INSTALLED','FOREIGN_BOT_TASK_HOLD','BOT_TASK_DISABLED','BOT_UPDATE_BUSY','SOURCE_GIT_FAILED','SOURCE_ORIGIN_UNVERIFIED','SOURCE_NOT_CLEAN_MAIN','SOURCE_REVISION_UNVERIFIED','SOURCE_MAIN_PUBLICATION_CHANGED','PUBLISHER_SIGNATURE_UNVERIFIED','TOOLBOX_SOURCE_ADMISSION_HOLD','STAGE_IDENTITY_UNVERIFIED','STAGED_DEPENDENCIES_FAILED','STAGED_TESTS_FAILED','INSTALLED_SOURCE_MOVED','BOT_TASK_STATE_UNCONFIRMED','CANDIDATE_GATEWAY_UNVERIFIED','DEPLOYMENT_SOURCE_MISMATCH','BOT_UPDATE_OPERATION_FAILED','BOT_UPDATE_RECEIPT_INVALID')
    $code = [string]$_.Exception.Message
    if ($code -cnotin $allowed) { $code = 'BOT_UPDATE_UNCLASSIFIED_HOLD' }
    if ($switched) {
        try {
            BotOwnedTaskStop
            [void](NodeCli @('recover',$root))
            BotOwnedTaskStart
            if (-not (Await-Gateway -Seconds 60)) { Fail 'ROLLBACK_GATEWAY_UNVERIFIED' }
            Write-Output 'BOT_UPDATE_ROLLED_BACK'
        } catch { Write-Output 'BOT_UPDATE_ROLLBACK_UNVERIFIED' }
    }
    Write-Output $code
    exit 1
} finally {
    # Do not delete partial stages that may contain unique interrupted-work evidence.
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
