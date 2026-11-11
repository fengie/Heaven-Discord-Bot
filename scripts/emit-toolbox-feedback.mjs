import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildChildFeedback } from '../src/child-feedback.mjs';
const run = (...args) => execFileSync('git',args,{encoding:'utf8',timeout:10000,maxBuffer:32768,stdio:['ignore','pipe','ignore']}).trim();
try {
  const head = run('rev-parse','HEAD');
  if (run('status','--porcelain','--untracked-files=normal') !== '') throw new Error('UNCOMMITTED_SOURCE');
  const origin = run('remote','get-url','origin');
  if (!['https://github.com/fengie/Heaven-Discord-Bot.git','https://github.com/fengie/Heaven-Discord-Bot','git@github.com:fengie/Heaven-Discord-Bot.git'].includes(origin)) throw new Error('NONCANONICAL_ORIGIN');
  const entry = JSON.parse(readFileSync(new URL('../.heaven/agent-entry.json', import.meta.url),'utf8'));
  const packet = buildChildFeedback({childRevision:head,toolboxRevision:entry.toolbox.revision});
  // Reported source evidence only; parent must independently authenticate and review it.
  console.log(JSON.stringify(packet));
} catch {
  console.error('CHILD_FEEDBACK_SOURCE_UNVERIFIED');
  process.exitCode=1;
}
