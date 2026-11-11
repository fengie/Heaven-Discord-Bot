#requires -Version 5.1
[CmdletBinding()]
param(
  [ValidateSet('Install', 'Run')]
  [string]$Mode = 'Install'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Deny([string]$Code) { throw $Code }

# Fail before network, secret access, task changes, or filesystem writes.
if ([Environment]::MachineName.ToUpperInvariant() -cne 'HEAVEN') { Deny 'HEAVEN1_REQUIRED' }
# Release HOLD: no files, credentials, tasks, downloads or startup on HEAVEN.
Deny 'TOOLBOX_INHERITANCE_NOT_VERIFIED'
if (-not [Environment]::Is64BitProcess) { Deny 'WINDOWS_X64_REQUIRED' }
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { Deny 'LOCAL_APPDATA_UNAVAILABLE' }

$root = Join-Path $env:LOCALAPPDATA 'HeavenDiscordBot'
$app = Join-Path $root 'app'
$runtime = Join-Path $root 'node-v24.17.0-win-x64'
$node = Join-Path $runtime 'node.exe'
$npm = Join-Path $runtime 'node_modules\npm\bin\npm-cli.js'
$credentials = Join-Path $root 'credentials.dpapi.json'
$sourceFile = Join-Path $root 'source.sha'
$ownedScript = Join-Path $root 'Install-HeavenBot.ps1'
$logFile = Join-Path $root 'bot.log'
$taskName = 'Heaven Discord Bot'

function Require-File([string]$File) {
  if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { Deny 'REQUIRED_FILE_MISSING' }
  $entry = Get-Item -LiteralPath $File -Force
  if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Deny 'UNSAFE_REPARSE_FILE' }
}

function Get-Credentials {
  Require-File $credentials
  $cfg = Get-Content -LiteralPath $credentials -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string]$cfg.schema -cne 'heaven-discord-bot/credentials/v1' -or
    [string]::IsNullOrWhiteSpace([string]$cfg.tokenDpapi)) {
    Deny 'CREDENTIALS_INVALID'
  }
  return $cfg
}

function Run-Bot {
  Require-File $node
  Require-File (Join-Path $app 'src\index.mjs')
  $cfg = Get-Credentials
  Require-File $sourceFile
  $sourceSha = (Get-Content -LiteralPath $sourceFile -Raw -Encoding ASCII).Trim()
  if ($sourceSha -notmatch '^[a-f0-9]{40}
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:DISCORD_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $env:NODE_ENV = 'production'
  $env:PATH = "$runtime;$env:PATH"
  try { & $node (Join-Path $app 'src\index.mjs') *>> $logFile }
  finally { Remove-Item Env:DISCORD_TOKEN,Env:HEAVEN_BOT_SOURCE_SHA -ErrorAction SilentlyContinue }
  Deny 'BOT_PROCESS_EXITED'
}

if ($Mode -eq 'Run') {
  try { Run-Bot }
  catch {
    # No exception messages: native/HTTP details could contain credentials.
    Add-Content -LiteralPath $logFile -Value 'HEAVEN_BOT_RUNTIME_FAILED' -ErrorAction SilentlyContinue
    exit 1
  }
}

$user = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $user.User.Value
$userName = $user.Name
$mutex = [Threading.Mutex]::new($false, ('Local\HeavenDiscordBotInstall_' + $sid.Replace('-', '_')))
$locked = $false
$stage = $null
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Deny 'INSTALL_ALREADY_RUNNING' }
  if (Test-Path -LiteralPath $root) {
    $item = Get-Item -LiteralPath $root -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Deny 'UNSAFE_STATE_ROOT' }
  } else { New-Item -ItemType Directory -Path $root | Out-Null }
  $stage = Join-Path $root ('stage-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage | Out-Null

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Write-Output 'HEAVEN: downloading verified bot source and portable Node runtime...'
  $headers = @{ 'User-Agent' = 'HeavenDiscordBot-Installer' }
  $ref = Invoke-RestMethod -Uri 'https://api.github.com/repos/fengie/Heaven-Discord-Bot/branches/main' -Headers $headers
  $revision = [string]$ref.commit.sha
  if ($revision -notmatch '^[a-f0-9]{40}$') { Deny 'REMOTE_MAIN_UNVERIFIED' }

  if (Test-Path -LiteralPath $app) {
    $item = Get-Item -LiteralPath $app -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Deny 'UNSAFE_APP_DIRECTORY' }
    Require-File $sourceFile
    if ((Get-Content -LiteralPath $sourceFile -Raw).Trim() -cne $revision) {
      Deny 'INSTALLED_VERSION_CHANGED_STOP_FOR_REVIEW'
    }
  } else {
    $sourceZip = Join-Path $stage 'source.zip'
    $expanded = Join-Path $stage 'source'
    Invoke-WebRequest -UseBasicParsing -Uri ('https://codeload.github.com/fengie/Heaven-Discord-Bot/zip/' + $revision) -OutFile $sourceZip
    Expand-Archive -LiteralPath $sourceZip -DestinationPath $expanded
    $sources = @(Get-ChildItem -LiteralPath $expanded -Directory)
    if ($sources.Count -ne 1) { Deny 'SOURCE_ARCHIVE_INVALID' }
    $downloaded = $sources[0].FullName
    foreach ($relative in @('package.json','src\index.mjs','scripts\register-commands.mjs')) {
      Require-File (Join-Path $downloaded $relative)
    }
    Move-Item -LiteralPath $downloaded -Destination $app -ErrorAction Stop
    [IO.File]::WriteAllText($sourceFile, $revision, [Text.Encoding]::ASCII)
  }

  # Uses a portable official ZIP. No installed program, Docker, WSL or MSI.
  if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or
      -not (Test-Path -LiteralPath $npm -PathType Leaf)) {
    if (Test-Path -LiteralPath $runtime) { Deny 'PARTIAL_NODE_RUNTIME_HOLD' }
    $nodeZip = Join-Path $stage 'node.zip'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v24.17.0/node-v24.17.0-win-x64.zip' -OutFile $nodeZip
    $expectedSha256 = 'f2aa33b35b75aca5f3f7b85675a6f6423201053e9381911e64961f3bda2528ab'
    $actualSha256 = (Get-FileHash -LiteralPath $nodeZip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -cne $expectedSha256) { Deny 'NODE_ARCHIVE_CHECKSUM_MISMATCH' }
    $nodeExpanded = Join-Path $stage 'node'
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $nodeExpanded
    $stagedRuntime = Join-Path $nodeExpanded 'node-v24.17.0-win-x64'
    Require-File (Join-Path $stagedRuntime 'node.exe')
    Require-File (Join-Path $stagedRuntime 'node_modules\npm\bin\npm-cli.js')
    Move-Item -LiteralPath $stagedRuntime -Destination $runtime -ErrorAction Stop
  }
  Require-File $node
  Require-File $npm
  if ((& $node --version).Trim() -cne 'v24.17.0' -or $LASTEXITCODE -ne 0) {
    Deny 'NODE_RUNTIME_VERSION_MISMATCH'
  }

  Write-Output 'HEAVEN: installing bot dependencies...'
  $env:PATH = "$runtime;$env:PATH"
  & $node $npm ci --prefix $app --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error | Out-Null
  if ($LASTEXITCODE -ne 0) { Deny 'NPM_INSTALL_FAILED' }

  if (-not (Test-Path -LiteralPath $credentials)) {
    Write-Output 'Paste the Discord bot token once on HEAVEN; input is hidden.'
    $secureToken = Read-Host -AsSecureString -Prompt 'Discord bot token'
    if ($secureToken.Length -lt 30) { Deny 'CREDENTIAL_INPUT_INVALID' }
    $cipher = ConvertFrom-SecureString -SecureString $secureToken
    $secureToken.Dispose()
    $configuration = @{
      schema = 'heaven-discord-bot/credentials/v1'
      tokenDpapi = $cipher
    } | ConvertTo-Json -Compress
    $pending = Join-Path $stage 'credentials.pending'
    [IO.File]::WriteAllText($pending, $configuration, ([Text.UTF8Encoding]::new($false)))
    [IO.File]::Move($pending, $credentials)
    $aclResult = & icacls.exe $credentials /inheritance:r /grant:r ('*' + $sid + ':(R)') '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' 2>&1
    if ($LASTEXITCODE -ne 0) { Deny 'CREDENTIAL_ACL_UNVERIFIED' }
  }
  [void](Get-Credentials)

  # One ordinary per-user task. Passwordless DPAPI requires an interactive logon.
  $execute = Join-Path $PSHOME 'powershell.exe'
  $arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ownedScript + '" -Mode Run'
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($null -ne $existing) {
    $actions = @($existing.Actions)
    if ($actions.Count -ne 1 -or
        [string]$actions[0].Execute -ine $execute -or
        [string]$actions[0].Arguments -cne $arguments -or
        [string]$existing.Principal.UserId -notin @($sid, $userName) -or
        [string]$existing.Principal.LogonType -cne 'Interactive') {
      Deny 'FOREIGN_TASK_HOLD'
    }
    if ([string]$existing.State -eq 'Disabled') { Deny 'OWNED_TASK_DISABLED' }
  }
  if (-not (Test-Path -LiteralPath $ownedScript)) {
    Require-File $PSCommandPath
    Copy-Item -LiteralPath $PSCommandPath -Destination $ownedScript -ErrorAction Stop
  }
  if ($null -eq $existing) {
    $action = New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $app
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
    $principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'User-owned Heaven Discord Bot at logon' | Out-Null
  }
  $task = Get-ScheduledTask -TaskName $taskName
  if ([string]$task.State -ne 'Running') {
    if (Test-Path -LiteralPath $logFile) { Clear-Content -LiteralPath $logFile }
    Write-Output 'HEAVEN: starting Discord bot...'
    Start-ScheduledTask -TaskName $taskName
  }
  $ready = $false
  for ($attempt = 0; $attempt -lt 25; $attempt++) {
    Start-Sleep -Seconds 2
    try {
      $task = Get-ScheduledTask -TaskName $taskName
      if ([string]$task.State -eq 'Running' -and (Test-Path -LiteralPath $logFile -PathType Leaf) -and
        (Select-String -Path $logFile -Pattern '"event":"discord.ready"' -SimpleMatch -Quiet)) {
        $ready = $true
        break
      }
    } catch { }
  }
  if (-not $ready) { Deny 'BOT_GATEWAY_READY_NOT_VERIFIED' }
  Write-Output 'HEAVEN_BOT_READY host=HEAVEN task="Heaven Discord Bot"'
  Write-Output 'Test /ping in Discord Besties.'
} catch {
  # Never print original exception: native/HTTP errors can contain credential text.
  $safeCodes = @(
    'HEAVEN1_REQUIRED','WINDOWS_X64_REQUIRED','LOCAL_APPDATA_UNAVAILABLE','INSTALL_ALREADY_RUNNING',
    'UNSAFE_STATE_ROOT','UNSAFE_APP_DIRECTORY','REMOTE_MAIN_UNVERIFIED','SOURCE_ARCHIVE_INVALID',
    'REQUIRED_FILE_MISSING','UNSAFE_REPARSE_FILE','INSTALLED_VERSION_CHANGED_STOP_FOR_REVIEW',
    'PARTIAL_NODE_RUNTIME_HOLD','NODE_ARCHIVE_CHECKSUM_MISMATCH','NODE_RUNTIME_VERSION_MISMATCH',
    'NPM_INSTALL_FAILED','CREDENTIAL_INPUT_INVALID','CREDENTIAL_ACL_UNVERIFIED',
    'CREDENTIALS_INVALID','FOREIGN_TASK_HOLD','OWNED_TASK_DISABLED','BOT_GATEWAY_READY_NOT_VERIFIED'
  )
  $code = [string]$_.Exception.Message
  if ($code -cnotin $safeCodes) { $code = 'SETUP_FAILED_CHECK_LOCAL_TASK' }
  Write-Output ('HEAVEN_BOT_' + $code)
  exit 1
} finally {
  if ($null -ne $stage -and (Test-Path -LiteralPath $stage)) {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
) { Deny 'INSTALLED_SHA_INVALID' }
  $env:HEAVEN_BOT_SOURCE_SHA = $sourceSha
  $secure = ConvertTo-SecureString -String ([string]$cfg.tokenDpapi)
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:DISCORD_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $env:NODE_ENV = 'production'
  $env:PATH = "$runtime;$env:PATH"
  try { & $node (Join-Path $app 'src\index.mjs') *>> $logFile }
  finally { Remove-Item Env:DISCORD_TOKEN -ErrorAction SilentlyContinue }
  Deny 'BOT_PROCESS_EXITED'
}

if ($Mode -eq 'Run') {
  try { Run-Bot }
  catch {
    # No exception messages: native/HTTP details could contain credentials.
    Add-Content -LiteralPath $logFile -Value 'HEAVEN_BOT_RUNTIME_FAILED' -ErrorAction SilentlyContinue
    exit 1
  }
}

$user = [Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $user.User.Value
$userName = $user.Name
$mutex = [Threading.Mutex]::new($false, ('Local\HeavenDiscordBotInstall_' + $sid.Replace('-', '_')))
$locked = $false
$stage = $null
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Deny 'INSTALL_ALREADY_RUNNING' }
  if (Test-Path -LiteralPath $root) {
    $item = Get-Item -LiteralPath $root -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Deny 'UNSAFE_STATE_ROOT' }
  } else { New-Item -ItemType Directory -Path $root | Out-Null }
  $stage = Join-Path $root ('stage-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage | Out-Null

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Write-Output 'HEAVEN: downloading verified bot source and portable Node runtime...'
  $headers = @{ 'User-Agent' = 'HeavenDiscordBot-Installer' }
  $ref = Invoke-RestMethod -Uri 'https://api.github.com/repos/fengie/Heaven-Discord-Bot/branches/main' -Headers $headers
  $revision = [string]$ref.commit.sha
  if ($revision -notmatch '^[a-f0-9]{40}$') { Deny 'REMOTE_MAIN_UNVERIFIED' }

  if (Test-Path -LiteralPath $app) {
    $item = Get-Item -LiteralPath $app -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Deny 'UNSAFE_APP_DIRECTORY' }
    Require-File $sourceFile
    if ((Get-Content -LiteralPath $sourceFile -Raw).Trim() -cne $revision) {
      Deny 'INSTALLED_VERSION_CHANGED_STOP_FOR_REVIEW'
    }
  } else {
    $sourceZip = Join-Path $stage 'source.zip'
    $expanded = Join-Path $stage 'source'
    Invoke-WebRequest -UseBasicParsing -Uri ('https://codeload.github.com/fengie/Heaven-Discord-Bot/zip/' + $revision) -OutFile $sourceZip
    Expand-Archive -LiteralPath $sourceZip -DestinationPath $expanded
    $sources = @(Get-ChildItem -LiteralPath $expanded -Directory)
    if ($sources.Count -ne 1) { Deny 'SOURCE_ARCHIVE_INVALID' }
    $downloaded = $sources[0].FullName
    foreach ($relative in @('package.json','src\index.mjs','scripts\register-commands.mjs')) {
      Require-File (Join-Path $downloaded $relative)
    }
    Move-Item -LiteralPath $downloaded -Destination $app -ErrorAction Stop
    [IO.File]::WriteAllText($sourceFile, $revision, [Text.Encoding]::ASCII)
  }

  # Uses a portable official ZIP. No installed program, Docker, WSL or MSI.
  if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or
      -not (Test-Path -LiteralPath $npm -PathType Leaf)) {
    if (Test-Path -LiteralPath $runtime) { Deny 'PARTIAL_NODE_RUNTIME_HOLD' }
    $nodeZip = Join-Path $stage 'node.zip'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v24.17.0/node-v24.17.0-win-x64.zip' -OutFile $nodeZip
    $expectedSha256 = 'f2aa33b35b75aca5f3f7b85675a6f6423201053e9381911e64961f3bda2528ab'
    $actualSha256 = (Get-FileHash -LiteralPath $nodeZip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -cne $expectedSha256) { Deny 'NODE_ARCHIVE_CHECKSUM_MISMATCH' }
    $nodeExpanded = Join-Path $stage 'node'
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $nodeExpanded
    $stagedRuntime = Join-Path $nodeExpanded 'node-v24.17.0-win-x64'
    Require-File (Join-Path $stagedRuntime 'node.exe')
    Require-File (Join-Path $stagedRuntime 'node_modules\npm\bin\npm-cli.js')
    Move-Item -LiteralPath $stagedRuntime -Destination $runtime -ErrorAction Stop
  }
  Require-File $node
  Require-File $npm
  if ((& $node --version).Trim() -cne 'v24.17.0' -or $LASTEXITCODE -ne 0) {
    Deny 'NODE_RUNTIME_VERSION_MISMATCH'
  }

  Write-Output 'HEAVEN: installing bot dependencies...'
  $env:PATH = "$runtime;$env:PATH"
  & $node $npm ci --prefix $app --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error | Out-Null
  if ($LASTEXITCODE -ne 0) { Deny 'NPM_INSTALL_FAILED' }

  if (-not (Test-Path -LiteralPath $credentials)) {
    Write-Output 'Paste the Discord bot token once on HEAVEN; input is hidden.'
    $secureToken = Read-Host -AsSecureString -Prompt 'Discord bot token'
    if ($secureToken.Length -lt 30) { Deny 'CREDENTIAL_INPUT_INVALID' }
    $cipher = ConvertFrom-SecureString -SecureString $secureToken
    $secureToken.Dispose()
    $configuration = @{
      schema = 'heaven-discord-bot/credentials/v1'
      tokenDpapi = $cipher
    } | ConvertTo-Json -Compress
    $pending = Join-Path $stage 'credentials.pending'
    [IO.File]::WriteAllText($pending, $configuration, ([Text.UTF8Encoding]::new($false)))
    [IO.File]::Move($pending, $credentials)
    $aclResult = & icacls.exe $credentials /inheritance:r /grant:r ('*' + $sid + ':(R)') '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' 2>&1
    if ($LASTEXITCODE -ne 0) { Deny 'CREDENTIAL_ACL_UNVERIFIED' }
  }
  [void](Get-Credentials)

  # One ordinary per-user task. Passwordless DPAPI requires an interactive logon.
  $execute = Join-Path $PSHOME 'powershell.exe'
  $arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $ownedScript + '" -Mode Run'
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($null -ne $existing) {
    $actions = @($existing.Actions)
    if ($actions.Count -ne 1 -or
        [string]$actions[0].Execute -ine $execute -or
        [string]$actions[0].Arguments -cne $arguments -or
        [string]$existing.Principal.UserId -notin @($sid, $userName) -or
        [string]$existing.Principal.LogonType -cne 'Interactive') {
      Deny 'FOREIGN_TASK_HOLD'
    }
    if ([string]$existing.State -eq 'Disabled') { Deny 'OWNED_TASK_DISABLED' }
  }
  if (-not (Test-Path -LiteralPath $ownedScript)) {
    Require-File $PSCommandPath
    Copy-Item -LiteralPath $PSCommandPath -Destination $ownedScript -ErrorAction Stop
  }
  if ($null -eq $existing) {
    $action = New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $app
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userName
    $principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'User-owned Heaven Discord Bot at logon' | Out-Null
  }
  $task = Get-ScheduledTask -TaskName $taskName
  if ([string]$task.State -ne 'Running') {
    if (Test-Path -LiteralPath $logFile) { Clear-Content -LiteralPath $logFile }
    Write-Output 'HEAVEN: starting Discord bot...'
    Start-ScheduledTask -TaskName $taskName
  }
  $ready = $false
  for ($attempt = 0; $attempt -lt 25; $attempt++) {
    Start-Sleep -Seconds 2
    try {
      $task = Get-ScheduledTask -TaskName $taskName
      if ([string]$task.State -eq 'Running' -and (Test-Path -LiteralPath $logFile -PathType Leaf) -and
        (Select-String -Path $logFile -Pattern '"event":"discord.ready"' -SimpleMatch -Quiet)) {
        $ready = $true
        break
      }
    } catch { }
  }
  if (-not $ready) { Deny 'BOT_GATEWAY_READY_NOT_VERIFIED' }
  Write-Output 'HEAVEN_BOT_READY host=HEAVEN task="Heaven Discord Bot"'
  Write-Output 'Test /ping in Discord Besties.'
} catch {
  # Never print original exception: native/HTTP errors can contain credential text.
  $safeCodes = @(
    'HEAVEN1_REQUIRED','WINDOWS_X64_REQUIRED','LOCAL_APPDATA_UNAVAILABLE','INSTALL_ALREADY_RUNNING',
    'UNSAFE_STATE_ROOT','UNSAFE_APP_DIRECTORY','REMOTE_MAIN_UNVERIFIED','SOURCE_ARCHIVE_INVALID',
    'REQUIRED_FILE_MISSING','UNSAFE_REPARSE_FILE','INSTALLED_VERSION_CHANGED_STOP_FOR_REVIEW',
    'PARTIAL_NODE_RUNTIME_HOLD','NODE_ARCHIVE_CHECKSUM_MISMATCH','NODE_RUNTIME_VERSION_MISMATCH',
    'NPM_INSTALL_FAILED','CREDENTIAL_INPUT_INVALID','CREDENTIAL_ACL_UNVERIFIED',
    'CREDENTIALS_INVALID','FOREIGN_TASK_HOLD','OWNED_TASK_DISABLED','BOT_GATEWAY_READY_NOT_VERIFIED'
  )
  $code = [string]$_.Exception.Message
  if ($code -cnotin $safeCodes) { $code = 'SETUP_FAILED_CHECK_LOCAL_TASK' }
  Write-Output ('HEAVEN_BOT_' + $code)
  exit 1
} finally {
  if ($null -ne $stage -and (Test-Path -LiteralPath $stage)) {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
