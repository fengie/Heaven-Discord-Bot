import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { stageCandidate, activateStaged, confirmCandidate, recoverInterrupted, readInstalledRevision } from '../src/update-transaction.mjs';

const oldSha = 'a'.repeat(40);
const newSha = 'b'.repeat(40);
const fixture = async fn => {
  const parent = await mkdtemp(join(tmpdir(), 'heaven-bot-update-'));
  const root = join(parent,'installed');
  const source = join(parent,'source');
  await mkdir(root); await mkdir(source);
  await mkdir(join(source,'src'));
  await writeFile(join(source,'package.json'), '{"name":"heaven-discord-bot"}');
  await writeFile(join(source,'src','index.mjs'), 'console.log("candidate")');
  await mkdir(join(root,'app'));
  await writeFile(join(root,'app','sentinel.txt'),'original');
  await writeFile(join(root,'source.sha'),oldSha+'\n');
  try { await fn({parent,root,source}); } finally { await rm(parent,{recursive:true,force:true}); }
};

test('stages a bounded exact-source snapshot without touching installed application', async () => fixture(async ({root,source}) => {
  const snapshot = await stageCandidate({root,source,revision:newSha,files:['package.json','src/index.mjs']});
  assert.equal(await readFile(join(snapshot.stage,'src','index.mjs'),'utf8'),'console.log("candidate")');
  assert.equal(await readFile(join(root,'app','sentinel.txt'),'utf8'),'original');
  assert.equal(await readInstalledRevision(root),oldSha);
}));

test('activation has a recoverable journal and rollback on interrupted or failed update', async () => fixture(async ({root,source}) => {
  const {stage} = await stageCandidate({root,source,revision:newSha,files:['package.json','src/index.mjs']});
  await activateStaged({root,stage,revision:newSha,previousRevision:oldSha});
  assert.equal(await readInstalledRevision(root),newSha);
  assert.equal(await readFile(join(root,'app','src','index.mjs'),'utf8'),'console.log("candidate")');
  await recoverInterrupted(root);
  assert.equal(await readInstalledRevision(root),oldSha);
  assert.equal(await readFile(join(root,'app','sentinel.txt'),'utf8'),'original');
}));

test('positive acceptance retains previous for later rollback without a pending journal', async () => fixture(async ({root,source}) => {
  const {stage} = await stageCandidate({root,source,revision:newSha,files:['package.json','src/index.mjs']});
  await activateStaged({root,stage,revision:newSha,previousRevision:oldSha});
  await confirmCandidate(root,newSha);
  assert.equal(await readInstalledRevision(root),newSha);
  assert.ok((await readdir(root)).includes('previous-'+oldSha));
  assert.ok(!(await readdir(root)).includes('update-journal.json'));
}));

test('rejects symlinks before staging and preserves the original install', async t => fixture(async ({root,source}) => {
  const {symlink} = await import('node:fs/promises');
  try { await symlink(join(source,'package.json'),join(source,'unsafe.txt')); }
  catch (e) { if (e.code==='EPERM') return t.skip('Symlinks require privilege on this runner'); throw e; }
  await assert.rejects(stageCandidate({root,source,revision:newSha,files:['unsafe.txt']}),/SYMLINK|UNSAFE/);
  assert.equal(await readInstalledRevision(root),oldSha);
}));

test('rejects traversal, duplicate paths, and foreign preexisting stages', async () => fixture(async ({root,source}) => {
  await assert.rejects(stageCandidate({root,source,revision:newSha,files:['../leak']}),/UNSAFE/);
  await assert.rejects(stageCandidate({root,source,revision:newSha,files:['package.json','package.json']}),/DUPLICATE/);
  await mkdir(join(root,'.stage-'+newSha));
  await assert.rejects(stageCandidate({root,source,revision:newSha,files:['package.json']}),/STAGE_OCCUPIED/);
  assert.equal(await readInstalledRevision(root),oldSha);
}));

test('a corrupt installed pointer or unknown journal fails without overwriting data', async () => fixture(async ({root,source}) => {
  await writeFile(join(root,'source.sha'),'not-a-sha\n');
  await assert.rejects(readInstalledRevision(root),/INVALID/);
  await writeFile(join(root,'update-journal.json'),'{"invalid":true}');
  await assert.rejects(recoverInterrupted(root),/INVALID_JOURNAL/);
  assert.equal(await readFile(join(root,'app','sentinel.txt'),'utf8'),'original');
}));

test('reviewed Node adoption sources retain exact Git blob bytes with Windows line-ending conversion enabled', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const repository = fileURLToPath(new URL('../', import.meta.url));
  const checkout = await mkdtemp(join(tmpdir(), 'heaven-bot-adoption-eol-'));
  try {
    const emptyAttributes = join(checkout, 'empty-global-attributes');
    await writeFile(emptyAttributes, '');
    const git = (cwd, ...args) => execFileSync('git', [
      '-C', cwd, '-c', 'core.attributesFile=' + emptyAttributes,
      ...args
    ], {
      env: { ...process.env, GIT_ATTR_NOSYSTEM: '1' },
      timeout: 15000, windowsHide: true, maxBuffer: 2 * 1024 * 1024
    });
    git(checkout, '-c', 'init.templateDir=', 'init', '--quiet');
    git(checkout, 'config', 'core.autocrlf', 'true');
    git(checkout, 'config', 'core.eol', 'crlf');
    git(checkout, 'config', 'core.safecrlf', 'false');
    await mkdir(join(checkout, 'src'));
    const mapped = ['package.json', 'src/index.mjs'];
    const expected = new Map();
    for (const path of mapped) {
      const bytes = git(repository, 'cat-file', 'blob', 'HEAD:' + path);
      assert.ok(bytes.includes(10) && !bytes.includes(13), path + ' must have canonical LF Git bytes');
      expected.set(path, bytes);
      await writeFile(join(checkout, path), bytes);
    }
    // Use the actual child policy, not test-only attributes that would mask a
    // checkout discrepancy. Recreate the files from Git's staged blobs.
    try {
      await writeFile(join(checkout, '.gitattributes'), await readFile(join(repository, '.gitattributes')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    git(checkout, 'add', '--all');
    for (const path of mapped) await rm(join(checkout, path));
    git(checkout, 'checkout-index', '--force', '--all');
    for (const path of mapped) {
      const actual = await readFile(join(checkout, path));
      assert.ok(actual.equals(expected.get(path)), path + ' checkout bytes differ from reviewed Git blob');
    }
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});
