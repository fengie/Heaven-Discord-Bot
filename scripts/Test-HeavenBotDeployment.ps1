#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepoRoot = (Join-Path $PSScriptRoot '..'),
    [Parameter(Mandatory = $true)][string]$ExpectedSourceSha
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Hold([string]$Code) { throw $Code }
if ([Environment]::MachineName.ToUpperInvariant() -cne 'HEAVEN') { Hold 'HEAVEN1_REQUIRED' }
if ($ExpectedSourceSha -notmatch '^[a-f0-9]{40}$' -or -not $env:LOCALAPPDATA) { Hold 'INVALID_HOST_OR_SOURCE' }

$repo = (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
$root = Join-Path $env:LOCALAPPDATA 'HeavenDiscordBot'
$app = Join-Path $root 'app'
$pointer = Join-Path $root 'source.sha'
$log = Join-Path $root 'bot.log'
$taskName = 'Heaven Discord Bot'
$script = Join-Path $root 'Install-HeavenBot.ps1'
$exe = Join-Path $PSHOME 'powershell.exe'
$args = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $script + '" -Mode Run'
$nativeUser = [Security.Principal.WindowsIdentity]::GetCurrent()

function Verify-GitBlob([string]$Relative) {
    $path = Join-Path $app $Relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Hold 'INSTALLED_BLOB_MISSING' }
    $item = Get-Item -LiteralPath $path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -gt 2097152) { Hold 'INSTALLED_BLOB_UNSAFE' }
    $gitPath = $Relative.Replace('\','/')
    $gitHash = (& git -C $repo rev-parse ('HEAD:'+$gitPath)).Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $gitHash -notmatch '^[a-f0-9]{40}$') { Hold 'SOURCE_BLOB_UNVERIFIED' }
    $bytes = [IO.File]::ReadAllBytes($path)
    $header = [Text.Encoding]::ASCII.GetBytes('blob ' + $bytes.Length + [char]0)
    $inputBytes = New-Object byte[] ($header.Length + $bytes.Length)
    [Array]::Copy($header,0,$inputBytes,0,$header.Length)
    [Array]::Copy($bytes,0,$inputBytes,$header.Length,$bytes.Length)
    $sha = [Security.Cryptography.SHA1]::Create()
    try { $observed = [BitConverter]::ToString($sha.ComputeHash($inputBytes)).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($observed -cne $gitHash) { Hold 'INSTALLED_BLOB_DRIFT' }
}

try {
    if (-not (Test-Path -LiteralPath $pointer -PathType Leaf) -or
        -not (Test-Path -LiteralPath $app -PathType Container) -or
        -not (Test-Path -LiteralPath $log -PathType Leaf)) { Hold 'BOT_RUNTIME_MISSING' }
    $installed = (Get-Content -LiteralPath $pointer -Raw -Encoding ASCII).Trim()
    if ($installed -cne $ExpectedSourceSha) { Hold 'INSTALLED_SHA_MISMATCH' }
    $head = (& git -C $repo rev-parse HEAD).Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $head -cne $ExpectedSourceSha) { Hold 'SOURCE_SHA_MISMATCH' }

    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    $actions = @($task.Actions)
    if ([string]$task.State -cne 'Running' -or $actions.Count -ne 1 -or
        [string]$actions[0].Execute -ine $exe -or
        [string]$actions[0].Arguments -cne $args -or
        [string]$task.Principal.UserId -notin @($nativeUser.User.Value,$nativeUser.Name) -or
        [string]$task.Principal.LogonType -cne 'Interactive') {
        Hold 'BOT_TASK_IDENTITY_UNVERIFIED'
    }

    foreach ($relative in @('package.json','package-lock.json','src\index.mjs','src\config.mjs','src\commands.mjs','src\release-inheritance.mjs','src\update-transaction.mjs')) {
        Verify-GitBlob $relative
    }

    $ready = $null
    foreach ($line in @(Get-Content -LiteralPath $log -Tail 80 -ErrorAction Stop)) {
        try {
            $event = [string]$line | ConvertFrom-Json -ErrorAction Stop
            if ([string]$event.event -cne 'discord.ready' -or
                [string]$event.sourceSha -cne $ExpectedSourceSha -or
                [int]$event.pid -le 0) { continue }
            $observed = [DateTimeOffset]::Parse([string]$event.observedAt)
            if ($observed -gt [DateTimeOffset]::UtcNow.AddSeconds(5)) { continue }
            $ready = $event
        } catch {}
    }
    if ($null -eq $ready) { Hold 'GATEWAY_READY_EVENT_UNVERIFIED' }
    $process = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = '+[int]$ready.pid) -ErrorAction Stop
    if ($null -eq $process -or [string]$process.Name -ine 'node.exe' -or
        [string]$process.CommandLine -notlike ('*'+(Join-Path $app 'src\index.mjs')+'*')) {
        Hold 'RUNNING_BOT_PROCESS_UNVERIFIED'
    }
    $ownerSid = Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid -ErrorAction Stop
    if ([string]$ownerSid.Sid -cne $nativeUser.User.Value) { Hold 'RUNNING_BOT_OWNER_UNVERIFIED' }
    $started = [DateTimeOffset]::Parse([string]$process.CreationDate)
    $observed = [DateTimeOffset]::Parse([string]$ready.observedAt)
    if ($started -gt $observed -or $observed -gt [DateTimeOffset]::UtcNow.AddSeconds(5)) { Hold 'GATEWAY_PROCESS_IDENTITY_CHANGED' }
    [pscustomobject]@{
        schema = 'heaven-discord-bot/deployment-verification/v1'
        status = 'verified'
        source_sha = $ExpectedSourceSha
        installed_sha = $installed
        host = 'HEAVEN'
        task = $taskName
        pid = [int]$ready.pid
        checked_at = [DateTimeOffset]::UtcNow.ToString('o')
    } | ConvertTo-Json -Compress
} catch {
    # No raw error output; process arguments and Git failures can contain secrets.
    throw 'BOT_DEPLOYMENT_UNVERIFIED'
}
