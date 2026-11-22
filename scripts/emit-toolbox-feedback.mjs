import { execFileSync } from 'node:child_process';
import { buildChildFeedback, resolveFeedbackToolboxRevision } from '../src/child-feedback.mjs';
const run = (...args) => execFileSync('git',args,{encoding:'utf8',timeout:10000,maxBuffer:32768,stdio:['ignore','pipe','ignore']}).trim();
try {
  const head = run('rev-parse','HEAD');
  if (run('status','--porcelain','--untracked-files=normal') !== '') throw new Error('UNCOMMITTED_SOURCE');
  const origin = run('remote','get-url','origin');
  if (!['https://github.com/fengie/Heaven-Discord-Bot.git','https://github.com/fengie/Heaven-Discord-Bot','git@github.com:fengie/Heaven-Discord-Bot.git'].includes(origin)) throw new Error('NONCANONICAL_ORIGIN');
  // Source material is read from exactly HEAD, never an untracked or stale
  // working-tree copy of either child inheritance manifest.
  const entry = JSON.parse(run('show', head + ':.heaven/agent-entry.json'));
  const subscription = JSON.parse(run('show', head + ':.heaven/toolbox-subscriptions.json'));
  const toolboxRevision = resolveFeedbackToolboxRevision(entry, subscription);
  const packet = buildChildFeedback({childRevision:head,toolboxRevision});
  // Reported source evidence only; parent must independently authenticate and review it.
  console.log(JSON.stringify(packet));
} catch {
  console.error('CHILD_FEEDBACK_SOURCE_UNVERIFIED');
  process.exitCode=1;
}
