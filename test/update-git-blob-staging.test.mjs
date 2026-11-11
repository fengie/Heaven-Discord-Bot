import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stageCandidate } from '../src/update-transaction.mjs';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], {
  encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const cli = fileURLToPath(new URL('../scripts/update-release-cli.mjs', import.meta.url));
const sha = 'b'.repeat(40);
const oid = bytes => createHash('sha1').update(Buffer.concat([
  Buffer.from('blob ' + bytes.length + '\0'), bytes,
])).digest('hex');

test('stages immutable Git blob bytes even when checked-out file uses Windows CRLF', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'heaven-bot-git-blob-'));
  const source = join(parent, 'worktree');
  const root = join(parent, 'installed');
  try {
    await mkdir(source); await mkdir(root); await mkdir(join(source, 'src'));
    const canonical = Buffer.from("export const message = 'ready';\n");
    const converted = Buffer.from("export const message = 'ready';\r\n");
    await writeFile(join(source, 'src', 'index.mjs'), converted);
    const snapshot = await stageCandidate({
      root, source, revision: sha, files: ['src/index.mjs'],
      sourceBlobs: new Map([['src/index.mjs', { oid: oid(canonical), bytes: canonical }]]),
    });
    assert.deepEqual(await readFile(join(snapshot.stage, 'src', 'index.mjs')), canonical,
      'Stage must use validated committed blob, never the working-tree conversion');
    assert.deepEqual(await readFile(join(source, 'src', 'index.mjs')), converted,
      'Stage must not mutate the working checkout');
  } finally { await rm(parent,{recursive:true,force:true}); }
});

test('rejects wrong Git blob OID without modifying an existing install', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'heaven-bot-git-digest-'));
  const source = join(parent,'source'),root = join(parent,'installed');
  try {
    await mkdir(source); await mkdir(root);
    await writeFile(join(source,'package.json'),'{"private":true}\n');
    const canonical = Buffer.from('{"private":true}\n');
    await assert.rejects(stageCandidate({
      root,source,revision:sha,files:['package.json'],
      sourceBlobs: new Map([['package.json',{oid:'f'.repeat(40),bytes:canonical}]]),
    }),/GIT_BLOB_DIGEST_MISMATCH/);
    assert.deepEqual(await readdir(root),[],'Only caller-owned staging may be cleaned');
  } finally { await rm(parent,{recursive:true,force:true}); }
});

test('CLI snapshots all immutable committed object bytes from a clean canonical main', async () => {
  const parent = await mkdtemp(join(tmpdir(),'heaven-bot-git-cli-'));
  const source = join(parent,'source'), root = join(parent,'runtime');
  try {
    await mkdir(source); await mkdir(root); await mkdir(join(source,'src'));
    git(source,['init','-b','main']);
    git(source,['config','user.email','ci@example.invalid']);
    git(source,['config','user.name','CI Fixture']);
    git(source,['remote','add','origin','https://github.com/fengie/Heaven-Discord-Bot.git']);
    await writeFile(join(source,'package.json'),'{"private":true}\n');
    await writeFile(join(source,'src','index.mjs'),"export const message = 'ready';\n");
    git(source,['add','--all']); git(source,['commit','-m','immutable source fixture']);
    const revision=git(source,['rev-parse','HEAD']);
    assert.equal(git(source,['status','--porcelain','--untracked-files=normal']),'');
    const output=execFileSync(process.execPath,[cli,'stage',root,source,revision],{
      encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe'],
    });
    const receipt=JSON.parse(output);
    assert.equal(receipt.schema,'heaven-discord-bot/update-operation/v1');
    for (const path of ['package.json','src/index.mjs']) {
      const committed = execFileSync('git',['-C',source,'show','HEAD:'+path]);
      assert.deepEqual(await readFile(join(receipt.stage,...path.split('/'))), committed);
    }
  } finally { await rm(parent,{recursive:true,force:true}); }
});

test('refuses symlink-valued tracked Git objects before publishing any stage', async t => {
  const parent = await mkdtemp(join(tmpdir(),'heaven-bot-git-link-'));
  const source = join(parent,'source'),root=join(parent,'runtime');
  try {
    await mkdir(source); await mkdir(root);
    git(source,['init','-b','main']);
    git(source,['config','user.email','ci@example.invalid']);
    git(source,['config','user.name','CI Fixture']);
    git(source,['remote','add','origin','https://github.com/fengie/Heaven-Discord-Bot.git']);
    await writeFile(join(source,'package.json'),'{"private":true}\n');
    const {symlink}=await import('node:fs/promises');
    try { await symlink('package.json',join(source,'unsafe-link')); }
    catch(e) { if(e.code==='EPERM')return t.skip('Symlink creation unavailable');throw e; }
    git(source,['add','--all']);git(source,['commit','-m','symlink fixture']);
    const revision=git(source,['rev-parse','HEAD']);
    assert.throws(()=>execFileSync(process.execPath,[cli,'stage',root,source,revision],{
      encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe'],
    }),/Command failed/);
    assert.deepEqual(await readdir(root),[]);
  } finally { await rm(parent,{recursive:true,force:true}); }
});
