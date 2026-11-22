import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChildFeedback } from '../src/child-feedback.mjs';

const child = 'a'.repeat(40);
const parent = 'b'.repeat(40);

test('child closeout packet has exact parent and child Git identities and bounded evidence', () => {
  const packet = buildChildFeedback({childRevision:child,toolboxRevision:parent});
  assert.equal(packet.schema,'heaven-toolbox/child-feedback/v1');
  assert.equal(packet.repository,'fengie/Heaven-Discord-Bot');
  assert.equal(packet.childRevision,child);
  assert.equal(packet.toolboxRevision,parent);
  assert.ok(packet.findings.length>=2 && packet.findings.length<=8);
  for (const finding of packet.findings) {
    assert.equal(finding.verification.status,'unverified');
    assert.ok(finding.summary.length>=12 && finding.summary.length<=500);
    assert.ok(finding.evidence.every(x=>x.path.startsWith('test/') || x.path.startsWith('docs/')));
  }
  assert.ok(!/DISCORD_TOKEN|PRIVATE KEY|secret\s*=|token\s*=/.test(JSON.stringify(packet)));
});

test('invalid revision or parent pin is rejected before feedback is emitted',()=>{
  assert.throws(()=>buildChildFeedback({childRevision:'wrong',toolboxRevision:parent}),/INVALID_CHILD_REVISION/);
  assert.throws(()=>buildChildFeedback({childRevision:child,toolboxRevision:'x'}),/INVALID_PARENT_REVISION/);
});

test('findings never declare automatic parent writes or verified deployment',()=>{
  const packet=buildChildFeedback({childRevision:child,toolboxRevision:parent});
  assert.ok(!Object.hasOwn(packet,'automaticParentWrite'));
  assert.ok(!Object.hasOwn(packet,'deployed'));
  assert.ok(packet.findings.every(x=>x.verification.status==='unverified'));
});


test('portable feedback source revision must match the committed subscription and agent-entry pin', async () => {
  const { resolveFeedbackToolboxRevision } = await import('../src/child-feedback.mjs');
  assert.equal(typeof resolveFeedbackToolboxRevision, 'function',
    'CLI lineage resolver must exist before emitting source-backed feedback');
  const entry = {
    schema:'heaven-toolbox/child-agent-entry/v1',
    toolbox:{repository:'fengie/heaven-toolbox',revision:parent},
  };
  const subscription = {
    schema:'heaven-toolbox/child-subscription/v1',
    repository:'fengie/Heaven-Discord-Bot',
    toolboxRevision:parent,
    capabilities:['release.autoupdate'],
  };
  assert.equal(resolveFeedbackToolboxRevision(entry, subscription), parent);
  assert.throws(
    () => resolveFeedbackToolboxRevision(entry, {...subscription,toolboxRevision:'c'.repeat(40)}),
    /CHILD_FEEDBACK_PIN_MISMATCH/
  );
  assert.throws(
    () => resolveFeedbackToolboxRevision(entry, {...subscription,repository:'fengie/another-repo'}),
    /CHILD_FEEDBACK_INHERITANCE_INVALID/
  );
  assert.throws(
    () => resolveFeedbackToolboxRevision({...entry,toolbox:{...entry.toolbox,repository:'other/private'}},subscription),
    /CHILD_FEEDBACK_INHERITANCE_INVALID/
  );
  assert.throws(
    () => resolveFeedbackToolboxRevision(entry, {...subscription,toolboxRevision:'not-a-sha'}),
    /CHILD_FEEDBACK_INHERITANCE_INVALID/
  );
  assert.throws(
    () => resolveFeedbackToolboxRevision(entry, {...subscription,capabilities:['release.autoupdate','release.autoupdate']}),
    /CHILD_FEEDBACK_INHERITANCE_INVALID/
  );
  assert.throws(
    () => resolveFeedbackToolboxRevision({...entry,schema:'invalid'},subscription),
    /CHILD_FEEDBACK_INHERITANCE_INVALID/
  );
});


test('actual CLI uses committed child inheritance and rejects clean but conflicting source pins', () => {
  const root = mkdtempSync(join(tmpdir(),'heaven-feedback-pin-'));
  const script = fileURLToPath(new URL('../scripts/emit-toolbox-feedback.mjs',import.meta.url));
  const git = (...args) => execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim();
  const entry = {
    schema:'heaven-toolbox/child-agent-entry/v1',
    toolbox:{repository:'fengie/heaven-toolbox',revision:parent},
  };
  const subscription = {
    schema:'heaven-toolbox/child-subscription/v1',
    repository:'fengie/Heaven-Discord-Bot',
    toolboxRevision:parent,
    capabilities:['release.autoupdate'],
  };
  try {
    git('init','-q');
    git('remote','add','origin','https://github.com/fengie/Heaven-Discord-Bot.git');
    mkdirSync(join(root,'.heaven'),{recursive:true});
    writeFileSync(join(root,'.heaven','agent-entry.json'),JSON.stringify(entry));
    writeFileSync(join(root,'.heaven','toolbox-subscriptions.json'),JSON.stringify(subscription));
    git('add','.heaven');
    git('-c','user.name=CI Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
    const expectedChildRevision = git('rev-parse','HEAD');
    const packet = JSON.parse(execFileSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:10000}));
    assert.equal(packet.childRevision,expectedChildRevision);
    assert.equal(packet.toolboxRevision,parent);
    assert.ok(packet.findings.every(x=>x.verification.status==='unverified'));
    // A clean committed mismatch is more important than an uncommitted edit:
    // the parent source reader will authenticate this subscription at HEAD.
    writeFileSync(join(root,'.heaven','toolbox-subscriptions.json'),
      JSON.stringify({...subscription,toolboxRevision:'c'.repeat(40)}));
    git('add','.heaven');
    git('-c','user.name=CI Fixture','-c','user.email=fixture@example.invalid','commit','-qm','mismatched-pin');
    const denied = spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:10000});
    assert.equal(denied.status,1);
    assert.match(denied.stderr,/CHILD_FEEDBACK_SOURCE_UNVERIFIED/);
    assert.equal(denied.stdout,'');
  } finally {
    rmSync(root,{recursive:true,force:true});
  }
});
