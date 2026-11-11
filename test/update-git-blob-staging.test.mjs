import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], {
  encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const cli = fileURLToPath(new URL('../scripts/update-release-cli.mjs', import.meta.url));

test('H1 update stages immutable Git blobs, not Windows CRLF-converted working bytes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'heaven-bot-git-stage-'));
  const source = join(parent, 'repo');
  const root = join(parent, 'runtime');
  try {
    await mkdir(source);
    await mkdir(root);
    await mkdir(join(source, 'src'));
    git(source, ['init', '-b', 'main']);
    git(source, ['config', 'user.email', 'test@example.invalid']);
    git(source, ['config', 'user.name', 'CI Fixture']);
    git(source, ['remote', 'add', 'origin', 'https://github.com/fengie/Heaven-Discord-Bot.git']);
    await writeFile(join(source, '.gitattributes'), '*.mjs text eol=crlf\n');
    await writeFile(join(source, 'package.json'), '{"private":true}\n');
    await writeFile(join(source, 'src', 'index.mjs'), "export const message = 'ready';\n");
    git(source, ['add', '--all']);
    git(source, ['commit', '-m', 'immutable source fixture']);
    git(source, ['checkout-index', '--force', '--all']);

    assert.equal(git(source, ['status', '--porcelain', '--untracked-files=normal']), '');
    const revision = git(source, ['rev-parse', 'HEAD']);
    const blob = execFileSync('git', ['-C', source, 'show', 'HEAD:src/index.mjs']);
    const converted = await readFile(join(source, 'src', 'index.mjs'));
    assert.notDeepEqual(converted, blob, 'Fixture must reproduce working-tree line ending drift');

    const output = execFileSync(process.execPath, [cli, 'stage', root, source, revision], {
      encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const receipt = JSON.parse(output);
    assert.equal(receipt.schema, 'heaven-discord-bot/update-operation/v1');
    assert.equal(receipt.revision, revision);
    assert.deepEqual(await readFile(join(receipt.stage, 'src', 'index.mjs')), blob,
      'Installed source must match immutable Git tree bytes, never converted worktree bytes');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('refuses symlink-valued tracked objects instead of executing a linked target', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'heaven-bot-git-link-'));
  const source = join(parent, 'repo');
  const root = join(parent, 'runtime');
  try {
    await mkdir(source); await mkdir(root);
    git(source, ['init', '-b', 'main']);
    git(source, ['config', 'user.email', 'test@example.invalid']);
    git(source, ['config', 'user.name', 'CI Fixture']);
    git(source, ['remote', 'add', 'origin', 'https://github.com/fengie/Heaven-Discord-Bot.git']);
    await writeFile(join(source, 'package.json'), '{"private":true}\n');
    const { symlink } = await import('node:fs/promises');
    try {
      await symlink('package.json', join(source, 'unsafe-link'));
    } catch (error) {
      if (error?.code === 'EPERM') return t.skip('Symlink creation denied on runner');
      throw error;
    }
    git(source, ['add', '--all']); git(source, ['commit', '-m', 'symlink source fixture']);
    const revision = git(source, ['rev-parse', 'HEAD']);
    assert.throws(() => execFileSync(process.execPath, [cli, 'stage', root, source, revision], {
      encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
    }), /Command failed/);
    assert.equal((await import('node:fs/promises')).readdir(root).then(x => x.length), undefined);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
