import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';

const SHA = /^[a-f0-9]{40}$/;
const JOURNAL = 'update-journal.json';
const SAFE_RELATIVE = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const MAX_FILES = 128;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const fail = code => { throw new Error(code); };
const exists = async path => { try { return await lstat(path); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; } };

async function plainDirectory(path) {
  const stat = await exists(path);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_DIRECTORY');
  return path;
}
async function plainFile(path) {
  const stat = await exists(path);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail('UNSAFE_SYMLINK_OR_FILE');
  return stat;
}
const normalizedSha = sha => { if (typeof sha !== 'string' || !SHA.test(sha)) fail('INVALID_SHA'); return sha; };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function relativeFile(value) {
  if (typeof value !== 'string' || !SAFE_RELATIVE.test(value) ||
      value.split('/').some(part => part === '.' || part === '..') ||
      /(^|\/)(node_modules|\.git|\.env|credentials\.|secret)/i.test(value)) {
    fail('UNSAFE_SOURCE_PATH');
  }
  return value;
}
async function stageBytes(source, target, relativePath) {
  const relative = relativeFile(relativePath);
  const parts = relative.split('/');
  let s = source, t = target;
  for (const part of parts.slice(0, -1)) {
    s = join(s, part);
    t = join(t, part);
    await plainDirectory(s);
    if (!(await exists(t))) await mkdir(t);
    await plainDirectory(t);
  }
  const input = join(s, parts.at(-1));
  const output = join(t, parts.at(-1));
  const stat = await plainFile(input);
  if (stat.size > MAX_FILE_BYTES) fail('SOURCE_FILE_TOO_LARGE');
  const bytes = await readFile(input);
  if (bytes.length !== stat.size) fail('SOURCE_CHANGED_DURING_COPY');
  const before = digest(bytes);
  await writeFile(output, bytes, {flag:'wx',mode:0o600});
  if (digest(await readFile(output)) !== before || digest(await readFile(input)) !== before) {
    fail('STAGED_FILE_MISMATCH');
  }
  return bytes.length;
}

export async function readInstalledRevision(root) {
  await plainDirectory(root);
  const pointer = join(root,'source.sha');
  await plainFile(pointer);
  const sha = (await readFile(pointer, 'utf8')).trim();
  return normalizedSha(sha);
}

export async function stageCandidate({root,source,revision,files}) {
  const next = normalizedSha(revision);
  await plainDirectory(root);
  await plainDirectory(source);
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) fail('INVALID_FILE_MANIFEST');
  if (new Set(files).size !== files.length) fail('DUPLICATE_SOURCE_FILE');
  for (const entry of files) relativeFile(entry);
  const stage = join(root,'.stage-'+next);
  if (await exists(stage)) fail('STAGE_OCCUPIED');
  await mkdir(stage,{mode:0o700});
  let total = 0;
  try {
    for (const file of files) {
      total += await stageBytes(source, stage, file);
      if (total > MAX_TOTAL_BYTES) fail('SOURCE_TOTAL_TOO_LARGE');
    }
    return {stage,revision:next,digestFiles:files.length,totalBytes:total};
  } catch (error) {
    // Only this caller's newly created stage is deleted.
    await rm(stage,{recursive:true,force:true});
    throw error;
  }
}

async function writePointer(root, revision) {
  normalizedSha(revision);
  const temporary = join(root,'.source-'+revision+'.tmp');
  await writeFile(temporary,revision+'\n',{flag:'wx',mode:0o600});
  try { await rename(temporary,join(root,'source.sha')); }
  finally { await rm(temporary,{force:true}).catch(()=>{}); }
}
async function readJournal(root) {
  const path = join(root,JOURNAL);
  if (!(await exists(path))) return null;
  try {
    await plainFile(path);
    const journal = JSON.parse(await readFile(path,'utf8'));
    if (!journal || journal.schema !== 'heaven-discord-bot/update-journal/v1' ||
        !SHA.test(journal.previousRevision) || !SHA.test(journal.revision) ||
        journal.previousRevision === journal.revision ||
        Object.keys(journal).sort().join(',') !== 'previousRevision,revision,schema') fail('INVALID_JOURNAL');
    return journal;
  } catch { fail('INVALID_JOURNAL'); }
}

export async function activateStaged({root,stage,revision,previousRevision}) {
  const next = normalizedSha(revision), prior = normalizedSha(previousRevision);
  if (next === prior) fail('SAME_REVISION');
  await plainDirectory(root); await plainDirectory(stage);
  const expectedStage = join(root,'.stage-'+next);
  if (resolve(stage) !== resolve(expectedStage)) fail('UNSAFE_STAGE_IDENTITY');
  const old = await readInstalledRevision(root);
  if (old !== prior) fail('INSTALLED_SOURCE_MOVED');
  await plainDirectory(join(root,'app'));
  const oldSlot = join(root,'previous-'+prior);
  if (await exists(oldSlot)) fail('PREVIOUS_RELEASE_OCCUPIED');
  const journalPath = join(root,JOURNAL);
  if (await exists(journalPath)) fail('UPDATE_PENDING_RECOVERY');
  const journal = {schema:'heaven-discord-bot/update-journal/v1',revision:next,previousRevision:prior};
  await writeFile(journalPath,JSON.stringify(journal)+'\n',{flag:'wx',mode:0o600});
  try {
    await rename(join(root,'app'),oldSlot);
    await rename(stage,join(root,'app'));
    await writePointer(root,next);
    if (await readInstalledRevision(root) !== next) fail('POST_PROMOTION_MISMATCH');
  } catch(error) {
    try { await recoverInterrupted(root); } catch { fail('ROLLBACK_UNVERIFIED'); }
    throw error;
  }
  return journal;
}

export async function confirmCandidate(root,revision) {
  const next = normalizedSha(revision);
  await plainDirectory(root);
  const journal = await readJournal(root);
  if (!journal || journal.revision !== next) fail('UPDATE_JOURNAL_NOT_FOUND');
  if (await readInstalledRevision(root) !== next) fail('INSTALLED_REVISION_UNVERIFIED');
  await plainDirectory(join(root,'app'));
  await plainDirectory(join(root,'previous-'+journal.previousRevision));
  await rm(join(root,JOURNAL));
  return {confirmed:true,revision:next,rollbackAvailable:true};
}

export async function recoverInterrupted(root) {
  await plainDirectory(root);
  const journal = await readJournal(root);
  if (!journal) return {recovered:false};
  const previous = join(root,'previous-'+journal.previousRevision);
  const application = join(root,'app');
  const oldStat = await exists(previous);
  const appStat = await exists(application);
  if (oldStat) {
    await plainDirectory(previous);
    if (appStat) {
      await plainDirectory(application);
      const failedPath = join(root,'failed-'+journal.revision);
      if (await exists(failedPath)) fail('FAILED_RELEASE_OCCUPIED');
      await rename(application,failedPath);
    }
    await rename(previous,application);
    await writePointer(root,journal.previousRevision);
    await rm(join(root,JOURNAL));
    return {recovered:true,revision:journal.previousRevision};
  }
  if (!appStat) fail('APP_AND_ROLLBACK_MISSING');
  await plainDirectory(application);
  if (await readInstalledRevision(root) !== journal.previousRevision) fail('ROLLBACK_NOT_AVAILABLE');
  await rm(join(root,JOURNAL));
  return {recovered:true,revision:journal.previousRevision};
}
