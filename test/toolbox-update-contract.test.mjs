import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function file(path) { return readFile(new URL('../' + path, import.meta.url), 'utf8'); }
async function json(path) { return JSON.parse(await file(path)); }

test('source+runtime update contracts are distinct and product requires apply script', async () => {
  const policy = await json('.heaven/update-policy.json');
  assert.equal(policy.schema, 'heaven-toolbox/update-policy/v1');
  assert.equal(policy.repository, 'fengie/Heaven-Discord-Bot');
  assert.equal(policy.kind, 'product');
  assert.equal(policy.branch, 'main');
  assert.deepEqual(policy.source_update.strategy, 'ff-only');
  assert.equal(policy.source_update.required, true);
  assert.equal(policy.runtime_update.mode, 'apply-script');
  assert.equal(policy.runtime_update.apply_script, 'scripts/Apply-HeavenBotUpdate.ps1');
  const app = await json('.heaven/app-update-policy.json');
  assert.equal(app.apiVersion, 'heaven.update/v1');
  assert.equal(app.mode, 'required');
  assert.equal(app.capability, 'release.autoupdate');
  assert.equal(app.transaction.atomicHandoff, true);
  assert.equal(app.transaction.rollbackRequired, true);
  assert.equal(app.transaction.installedIdentityVerification, true);
  assert.equal(app.integrity.artifactDigest, true);
  assert.equal(app.integrity.signedMetadata, true);
});

test('owned public workflow validates policy with no private Toolbox action or secrets', async () => {
  const w = await file('.github/workflows/heaven-autoupdate-policy.yml');
  assert.match(w, /on:\s*\n\s*push:/);
  assert.match(w, /pull_request:/);
  assert.match(w, /branches:\s*\[main\]/);
  assert.match(w, /contents: read/);
  assert.match(w, /npm test/);
  assert.doesNotMatch(w, /secrets\.|fengie\/heaven-toolbox\/.+\.github\/workflows/);
});

test('bot App Spec selects actual server-only capabilities', async () => {
  const spec = await json('app-spec.json');
  assert.equal(spec.apiVersion, 'heaven.app/v1');
  assert.deepEqual(spec.targets, ['server']);
  assert.equal(spec.metadata.name, 'heaven-discord-bot');
  assert.ok(spec.capabilities.includes('release.autoupdate'));
  assert.ok(spec.capabilities.includes('runtime.background-jobs'));
  assert.ok(spec.capabilities.includes('core.logging'));
  assert.ok(spec.capabilities.includes('network.http'));
});
