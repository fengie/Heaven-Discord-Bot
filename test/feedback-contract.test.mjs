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
