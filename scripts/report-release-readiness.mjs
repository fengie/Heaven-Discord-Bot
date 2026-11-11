import { inspectReleaseInheritance } from '../src/release-inheritance.mjs';

// Read-only local source audit: no private repository or host access.
const report = await inspectReleaseInheritance();
// Source inspection cannot attest independent parent quality, an installed
// Heaven1 process, a Discord interaction or an actual rollback. Keep those
// stages explicitly unverified rather than treating green source CI as release.
const acceptance = {
  schema: 'heaven-discord-bot/release-acceptance/v1',
  source_preflight: {
    state: report.ready ? 'PREFLIGHT_ONLY' : 'BLOCKED',
    blockers: report.blockers,
  },
  parent_quality: {
    state: report.blockers.includes('APP_PLATFORM_QUALITY_UNVERIFIED') ? 'BLOCKED' : 'UNVERIFIED',
  },
  h1_runtime: { state: 'UNVERIFIED' },
  discord_commands: { state: 'UNVERIFIED' },
  update_rollback: { state: 'UNVERIFIED' },
  overall: 'UNVERIFIED',
};
console.log(JSON.stringify({ ...report, acceptance }));
if (process.argv.includes('--assert-held') && report.ready) {
  console.error('RELEASE_HOLD_CLEARED_WITHOUT_REVIEW');
  process.exitCode = 1;
}
if (process.argv.includes('--require-ready') && !report.ready) {
  console.error('TOOLBOX_INHERITANCE_NOT_VERIFIED');
  process.exitCode = 1;
}
