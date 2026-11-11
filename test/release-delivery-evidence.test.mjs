import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/report-release-readiness.mjs', import.meta.url));

function report(...args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  });
}

test('release report distinguishes held source, parent quality and unverified physical delivery', () => {
  const result = report();
  assert.equal(result.status, 0, result.stderr || result.error?.message);

  const actual = JSON.parse(result.stdout);
  assert.equal(actual.schema, 'heaven-discord-bot/release-inheritance-check/v1');
  assert.equal(actual.ready, false);
  assert.deepEqual(actual.blockers, ['APP_PLATFORM_QUALITY_UNVERIFIED']);

  const acceptance = actual.acceptance;
  assert.equal(acceptance.schema, 'heaven-discord-bot/release-acceptance/v1');
  assert.equal(acceptance.source_preflight.state, 'BLOCKED');
  assert.deepEqual(acceptance.source_preflight.blockers, ['APP_PLATFORM_QUALITY_UNVERIFIED']);
  assert.equal(acceptance.parent_quality.state, 'BLOCKED');
  assert.equal(acceptance.h1_runtime.state, 'UNVERIFIED');
  assert.equal(acceptance.discord_commands.state, 'UNVERIFIED');
  assert.equal(acceptance.update_rollback.state, 'UNVERIFIED');
  assert.equal(acceptance.overall, 'NOT_DEPLOYED');
  assert.doesNotMatch(result.stdout, /DISCORD_TOKEN|credentials\.dpapi\.json/);
});

test('the status report never changes the fail-closed source admission exit code', () => {
  const result = report('--require-ready');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TOOLBOX_INHERITANCE_NOT_VERIFIED/);
});
