import { execFileSync } from 'node:child_process';
import { stageCandidate, activateStaged, confirmCandidate, recoverInterrupted, readInstalledRevision } from '../src/update-transaction.mjs';

const [mode, root, arg1, arg2] = process.argv.slice(2);
function fail(code) { throw new Error(code); }
function git(source, args) {
  return execFileSync('git',['-C',source,...args],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024}).trim();
}
try {
  let result;
  if (mode === 'stage') {
    if (!root || !arg1 || !arg2) fail('UPDATE_CLI_INPUT_INVALID');
    const head = git(arg1,['rev-parse','HEAD']);
    if (head !== arg2 || git(arg1,['branch','--show-current']) !== 'main' ||
        git(arg1,['status','--porcelain','--untracked-files=normal']) !== '') {
      fail('UPDATE_SOURCE_NOT_CURRENT_OR_CLEAN');
    }
    const origin = git(arg1,['remote','get-url','origin']);
    if (!['https://github.com/fengie/Heaven-Discord-Bot.git','https://github.com/fengie/Heaven-Discord-Bot','git@github.com:fengie/Heaven-Discord-Bot.git'].includes(origin)) {
      fail('UPDATE_SOURCE_ORIGIN_INVALID');
    }
    // Use the reviewed commit tree, never transformed checkout files. Git can
    // report a clean Windows worktree whose CRLF bytes differ from HEAD.
    // ls-tree also exposes symlink mode (120000), which must be rejected.
    const tree = execFileSync('git',['-C',arg1,'ls-tree','-r','-z','HEAD'],{
      timeout:15000,maxBuffer:1024*1024,
    }).toString('utf8');
    const sourceBlobs = new Map();
    for (const row of tree.split('\0').filter(Boolean)) {
      const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t([^\0]+)$/.exec(row);
      if (!match || match[1] === '120000') fail('UNSAFE_GIT_TREE_OBJECT');
      const [, mode, objectId, path] = match;
      if (['.env.example','.gitignore'].includes(path)) continue;
      if (sourceBlobs.has(path)) fail('DUPLICATE_GIT_PATH');
      // cat-file returns the exact committed byte stream, bypassing smudge and
      // checkout EOL filters. StageCandidate verifies each Git object SHA.
      const bytes = execFileSync('git',['-C',arg1,'cat-file','blob',objectId],{
        timeout:15000,maxBuffer:2*1024*1024+4096,
      });
      sourceBlobs.set(path,{oid:objectId,bytes});
    }
    result = await stageCandidate({
      root, source:arg1, revision:arg2, files:[...sourceBlobs.keys()], sourceBlobs,
    });
  } else if (mode === 'activate') {
    result = await activateStaged({root,stage:arg1,revision:arg2,previousRevision:await readInstalledRevision(root)});
  } else if (mode === 'confirm') {
    result = await confirmCandidate(root,arg1);
  } else if (mode === 'recover') {
    result = await recoverInterrupted(root);
  } else if (mode === 'current') {
    result = {revision:await readInstalledRevision(root)};
  } else fail('UPDATE_CLI_MODE_INVALID');
  console.log(JSON.stringify({schema:'heaven-discord-bot/update-operation/v1',mode, ...result}));
} catch(error) {
  // Do not echo process arguments, file paths, native Git output, or secrets.
  const safe = new Set([
    'UPDATE_CLI_INPUT_INVALID','UPDATE_SOURCE_NOT_CURRENT_OR_CLEAN','UPDATE_SOURCE_ORIGIN_INVALID',
    'UPDATE_CLI_MODE_INVALID','STAGE_OCCUPIED','UNSAFE_SOURCE_PATH','UNSAFE_DIRECTORY',
    'UNSAFE_SYMLINK_OR_FILE','SOURCE_TOTAL_TOO_LARGE','SOURCE_FILE_TOO_LARGE',
    'SOURCE_CHANGED_DURING_COPY','STAGED_FILE_MISMATCH','INVALID_JOURNAL','ROLLBACK_UNVERIFIED',
    'UPDATE_PENDING_RECOVERY','INSTALLED_SOURCE_MOVED','PREVIOUS_RELEASE_OCCUPIED',
    'POST_PROMOTION_MISMATCH','INVALID_SHA','DUPLICATE_SOURCE_FILE','UPDATE_JOURNAL_NOT_FOUND',
    'INSTALLED_REVISION_UNVERIFIED','SAME_REVISION','UNSAFE_STAGE_IDENTITY',
    'UNSAFE_GIT_TREE_OBJECT','DUPLICATE_GIT_PATH','INVALID_GIT_BLOB','INVALID_GIT_BLOBS','GIT_BLOB_DIGEST_MISMATCH'
  ]);
  const code = safe.has(error?.message) ? error.message : 'UPDATE_OPERATION_FAILED';
  console.error(code);
  process.exitCode = 1;
}
