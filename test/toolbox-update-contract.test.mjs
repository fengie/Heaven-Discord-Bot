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
  assert.equal(spec.metadata.applicationId, 'app.heaven.generated.heavendiscordbot');
  assert.deepEqual(spec.experience, {pages:[]});
  assert.deepEqual(spec.capabilities, [
    {id:'core.logging',config:{}},
    {id:'network.http',config:{}},
    {id:'runtime.background-jobs',config:{}},
    {id:'release.autoupdate',config:{}},
  ]);
  assert.deepEqual(Object.keys(spec), [
    'apiVersion','kind','metadata','targets','capabilities','experience','quality',
  ]);
});

test('dependency graph is locked and consumed by every runtime package installer', async () => {
  const manifest = await json('package.json');
  const lock = await json('package-lock.json');
  assert.equal(lock.lockfileVersion,3);
  assert.equal(lock.name,manifest.name);
  assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies);
  assert.ok(Object.keys(lock.packages).length>15);
  for (const [name,value] of Object.entries(lock.packages)) {
    if (name && !value.link) {
      assert.ok(value.integrity?.startsWith('sha512-'),name+' missing SHA-512 integrity');
    }
  }
  for (const path of ['Dockerfile','scripts/Install-HeavenBot.ps1','scripts/Apply-HeavenBotUpdate.ps1','.github/workflows/bot-ci.yml','.github/workflows/register-commands.yml']) {
    const text = await file(path);
    assert.match(text,/npm ci|\$npm ci/,path+' must install locked dependencies');
  }
});
