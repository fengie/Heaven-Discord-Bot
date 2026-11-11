import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = () => readFile(new URL('../scripts/Install-HeavenBot.ps1', import.meta.url), 'utf8');

test('native Windows setup has an explicit HEAVEN host gate before side effects', async () => {
  const source = await script();
  assert.match(source, /\[Environment\]::MachineName/);
  assert.match(source, /HEAVEN1_REQUIRED/);
  assert.match(source, /\[ValidateSet\('Install', 'Run'\)\]/);
  assert.match(source, /param\(/);
});

test('one command uses portable Node with pinned official SHA-256, not Docker or WSL', async () => {
  const source = await script();
  assert.match(source, /node-v24\.17\.0-win-x64\.zip/);
  assert.match(source, /f2aa33b35b75aca5f3f7b85675a6f6423201053e9381911e64961f3bda2528ab/i);
  assert.match(source, /Get-FileHash/);
  assert.doesNotMatch(source, /docker\s+compose|wsl\.exe|winget\s+install|choco\s+install/i);
});

test('secrets are locally DPAPI encrypted and never passed as process arguments', async () => {
  const source = await script();
  assert.match(source, /Read-Host\s+-AsSecureString/);
  assert.match(source, /ConvertFrom-SecureString/);
  assert.match(source, /ConvertTo-SecureString/);
  assert.match(source, /DISCORD_TOKEN/);
  assert.doesNotMatch(source, /(?:secrets\.DISCORD_TOKEN|DISCORD_TOKEN=\$\{|echo\s+\$token)/);
});

test('task is narrow, owned, restarts and requires actual Gateway readiness', async () => {
  const source = await script();
  assert.match(source, /New-ScheduledTaskPrincipal/);
  assert.match(source, /-LogonType Interactive/);
  assert.match(source, /-RestartCount/);
  assert.match(source, /HEAVEN_BOT_READY/);
  assert.match(source, /discord\.ready/);
  assert.match(source, /FOREIGN_TASK_HOLD/);
});
