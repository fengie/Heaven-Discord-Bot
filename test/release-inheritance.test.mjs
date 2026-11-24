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


test('local workflow and caller-authored quality metadata cannot authorize Gateway startup', async t => {
  const { inspectReleaseInheritance } = await import('../src/release-inheritance.mjs');
  const { cp, mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const fixture = await mkdtemp(join(tmpdir(), 'discord-quality-admission-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const relative of ['.heaven', 'src', 'scripts', 'test', 'targets', '.github', 'app-spec.json', 'package.json', 'AGENTS.md', 'README.md']) {
    await cp(new URL(relative, root), join(fixture, relative), { recursive: true });
  }
  await mkdir(join(fixture, '.github', 'workflows'), { recursive: true });
  await writeFile(join(fixture, '.github', 'workflows', 'app-platform-quality.yml'), 'name: fabricated local quality evidence\n');
  const directory = pathToFileURL(fixture + '/');
  const withWorkflow = await inspectReleaseInheritance(directory);
  assert.equal(withWorkflow.ready, false, 'workflow presence is not independent parent approval');
  assert.ok(withWorkflow.blockers.includes('APP_PLATFORM_QUALITY_UNVERIFIED'));

  await writeFile(join(fixture, '.heaven', 'manifest.json'), JSON.stringify({ ready: true, qualityValid: true }));
  await writeFile(join(fixture, '.heaven', 'quality-plan.json'), JSON.stringify({ ready: true, qualityValid: true }));
  const forged = await inspectReleaseInheritance(directory);
  assert.equal(forged.ready, false, 'caller-authored JSON is not a quality result');
  assert.ok(forged.blockers.includes('APP_PLATFORM_QUALITY_UNVERIFIED'));
  assert.ok(forged.blockers.includes('APP_PLATFORM_CONTRACT_INVALID'));
});
