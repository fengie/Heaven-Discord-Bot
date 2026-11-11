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
