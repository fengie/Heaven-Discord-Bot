import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = path => readFile(new URL(path, root), 'utf8');

test('release inheritance keeps App Platform generator quality held after local child source coverage', async () => {
  const { inspectReleaseInheritance } = await import('../src/release-inheritance.mjs');
  const report = await inspectReleaseInheritance(root);
  assert.equal(report.ready, false);
  assert.equal(report.schema, 'heaven-discord-bot/release-inheritance-check/v1');
  assert.deepEqual(report.blockers, ['APP_PLATFORM_QUALITY_UNVERIFIED']);
  assert.equal(JSON.stringify(report).includes('DISCORD_TOKEN'), false);
});

test('bot runtime verifies release inheritance before reading token or connecting to Gateway', async () => {
  const bot = await source('src/index.mjs');
  assert.match(bot, /inspectReleaseInheritance/);
  const gate = bot.indexOf('inspectReleaseInheritance(');
  assert.ok(gate !== -1 && gate < bot.indexOf('getBotToken()'));
  assert.match(bot, /TOOLBOX_INHERITANCE_NOT_VERIFIED/);
});

test('both H1 installers fail closed before host-side setup can mutate anything', async () => {
  const ps = await source('scripts/Install-HeavenBot.ps1');
  const sh = await source('scripts/bootstrap-heaven1.sh');
  assert.match(ps, /TOOLBOX_INHERITANCE_NOT_VERIFIED/);
  assert.ok(ps.indexOf('TOOLBOX_INHERITANCE_NOT_VERIFIED') < ps.indexOf("Join-Path $env:LOCALAPPDATA 'HeavenDiscordBot'"));
  assert.match(sh, /TOOLBOX_INHERITANCE_NOT_VERIFIED/);
  assert.ok(sh.indexOf('TOOLBOX_INHERITANCE_NOT_VERIFIED') < sh.indexOf('docker info'));
});

test('README does not imply completed inheritance or operational automatic updates', async () => {
  const readme = await source('README.md');
  assert.match(readme, /DO NOT RUN.*INSTALLER/i);
  assert.match(readme, /APP_PLATFORM_QUALITY_UNVERIFIED/);
});
