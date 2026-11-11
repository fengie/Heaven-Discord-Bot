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
    const files = execFileSync('git',['-C',arg1,'ls-files','-z'],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024}).split('\0').filter(Boolean).filter(file => !['.env.example','.gitignore'].includes(file));
    result = await stageCandidate({root,source:arg1,revision:arg2,files});
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
    'INSTALLED_REVISION_UNVERIFIED','SAME_REVISION','UNSAFE_STAGE_IDENTITY'
  ]);
  const code = safe.has(error?.message) ? error.message : 'UPDATE_OPERATION_FAILED';
  console.error(code);
  process.exitCode = 1;
}
