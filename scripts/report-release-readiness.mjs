import { inspectReleaseInheritance } from '../src/release-inheritance.mjs';

// Read-only local source audit: no private repository or host access.
const report = await inspectReleaseInheritance();
console.log(JSON.stringify(report));
if (process.argv.includes('--assert-held') && report.ready) {
  console.error('RELEASE_HOLD_CLEARED_WITHOUT_REVIEW');
  process.exitCode = 1;
}
if (process.argv.includes('--require-ready') && !report.ready) {
  console.error('TOOLBOX_INHERITANCE_NOT_VERIFIED');
  process.exitCode = 1;
}
