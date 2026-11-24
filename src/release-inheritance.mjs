import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const SAFE_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
async function content(root, relative) {
  if (typeof relative !== 'string' || !SAFE_PATH.test(relative) ||
      relative.split('/').some(p => p === '.' || p === '..')) return null;
  try { return await readFile(new URL(relative, root), 'utf8'); }
  catch { return null; }
}

async function json(root, relative) {
  const raw = await content(root, relative);
  if (raw === null || raw.length > 262144) return null;
  try {
    const value = JSON.parse(raw);
    return isObject(value) ? value : null;
  } catch { return null; }
}

// Local consistency checks are useful evidence, not independent parent
// approval. They must never execute a caller-selected workflow or trust its
// presence as proof of a passed run.
const expectedChecks = [
  'adapter-contracts', 'adapter:server:existing-node-product-tests',
  'adapter:server:existing-node-runtime-acceptance', 'adapter:server:existing-node-source-binding',
  'app-spec-valid', 'automatic-update-contract', 'capability-plan-resolves',
  'no-unresolved-template-tokens', 'performance-budget', 'scaffold-integrity',
  'security-baseline', 'update:server:atomic-deployment',
];
const expectedFiles = [
  '.heaven/agent-entry.json', '.heaven/app-update-policy.json', '.heaven/manifest.json',
  '.heaven/quality-plan.json', 'AGENTS.md', 'README.md', 'app-spec.json',
  'package.json', 'src/index.mjs', 'src/shared/README.md', 'targets/server/heaven.adapter.json',
];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');

async function inspectGeneratedContract(root) {
  const [app, manifest, quality, adapter, policy, pkg, entrypoint] = await Promise.all([
    json(root, 'app-spec.json'), json(root, '.heaven/manifest.json'),
    json(root, '.heaven/quality-plan.json'), json(root, 'targets/server/heaven.adapter.json'),
    json(root, '.heaven/app-update-policy.json'), content(root, 'package.json'), content(root, 'src/index.mjs'),
  ]);
  try {
    if (app?.apiVersion !== 'heaven.app/v1' || app.kind !== 'Application' ||
        app.metadata?.name !== 'heaven-discord-bot' || !same(app.targets, ['server']) ||
        !Array.isArray(app.capabilities) || !manifest || !quality || !adapter || !policy ||
        typeof pkg !== 'string' || typeof entrypoint !== 'string') return false;
    const specHash = digest(JSON.stringify(canonical(app)));
    if (manifest.apiVersion !== 'heaven.generated/v1' || manifest.layoutVersion !== 3 ||
        manifest.app !== 'heaven-discord-bot' || manifest.specHash !== specHash ||
        !same(manifest.targets, ['server']) || !same(manifest.files, expectedFiles) ||
        !same(manifest.adapters, [{ target:'server', id:'server.existing-node-esm', framework:'node' }]) ||
        !same(manifest.updatePolicy, policy) || !Array.isArray(manifest.qualityChecks) ||
        !same(manifest.qualityChecks.map(row => row?.id), expectedChecks) ||
        manifest.qualityChecks.some(row => row?.required !== true) ||
        quality.apiVersion !== 'heaven.quality/v1' || quality.app !== manifest.app ||
        quality.specHash !== specHash || !same(quality.checks, manifest.qualityChecks) ||
        adapter.apiVersion !== 'heaven.adapter/v1' || adapter.adapter !== 'server.existing-node-esm' ||
        adapter.framework !== 'node' || adapter.target !== 'server' || adapter.root !== 'repository' ||
        adapter.entrypoint !== 'src/index.mjs' || adapter.startCommand !== 'node src/index.mjs' ||
        adapter.sourceBinding !== 'caller-reviewed-bytes' || adapter.runtimeVerified !== false) return false;
    // Allow only ordinary Git LF/CRLF checkout conversion for this local
    // diagnostic. The independent parent gate still verifies raw Git bytes.
    const matches = (bytes, expected) => /^[a-f0-9]{64}$/.test(expected ?? '') &&
      (digest(bytes) === expected || digest(bytes.replace(/\r\n/g, '\n')) === expected);
    if (!matches(pkg, adapter.sourceDigests?.package) || !matches(entrypoint, adapter.sourceDigests?.entrypoint)) return false;
    return (await Promise.all(expectedFiles.map(path => content(root, path)))).every(value => value !== null);
  } catch {
    return false;
  }
}

/**
 * Fail-closed source preflight. Metadata is never proof of parent installation.
 * Never reads host credentials or accepts a self-issued "ready" flag.
 */
export async function inspectReleaseInheritance(root = ROOT) {
  const blockers = new Set();
  const entry = await json(root, '.heaven/agent-entry.json');
  const subscription = await json(root, '.heaven/toolbox-subscriptions.json');
  const parentRevision = entry?.toolbox?.revision;
  const validParent = /^[a-f0-9]{40}$/.test(parentRevision ?? '') &&
    entry?.toolbox?.repository === 'fengie/heaven-toolbox' &&
    subscription?.toolboxRevision === parentRevision &&
    subscription?.repository === 'fengie/Heaven-Discord-Bot';

  const capabilities = subscription?.capabilities;
  const mapped = await json(root, '.heaven/component-adoption.json');
  const applicable = ['core.logging','network.http','runtime.background-jobs','release.autoupdate'];
  const componentEvidence = mapped?.components;
  const componentCoverage = validParent && Array.isArray(capabilities) &&
    applicable.every(id => capabilities.includes(id)) &&
    mapped?.schema === 'heaven-toolbox/child-component-adoption/v1' &&
    mapped?.toolboxRevision === parentRevision &&
    mapped?.repository === 'fengie/Heaven-Discord-Bot' &&
    mapped?.privateParentSourceCopied === false &&
    Array.isArray(componentEvidence) &&
    componentEvidence.length === applicable.length &&
    componentEvidence.every(row =>
      applicable.includes(row?.id) &&
      row.evidenceState === 'SOURCE_TESTED' &&
      Array.isArray(row.regressions) && row.regressions.length >= 1
    ) &&
    new Set(componentEvidence.map(row => row.id)).size === applicable.length;
  if (!componentCoverage ||
      !(await Promise.all(componentEvidence.map(async row =>
        (await content(root,row.consumer)) !== null &&
        (await Promise.all(row.regressions.map(path => content(root,path)))).every(Boolean)
      ))).every(Boolean)) {
    blockers.add('TOOLBOX_CAPABILITIES_UNADOPTED');
  }

  const lessons = await json(root, '.heaven/lesson-adoption.json');
  const lessonEvidence = lessons?.regressionTests;
  const lessonCoverage = validParent && entry?.feedback?.automaticParentWrite === false &&
    entry?.feedback?.automaticChildUpdate === false &&
    !!entry?.toolbox?.lessonCatalogPath && !!entry?.toolbox?.skillRootPath &&
    lessons?.schema === 'heaven-toolbox/child-lesson-adoption/v1' &&
    lessons?.toolboxRevision === parentRevision &&
    lessons?.repository === 'fengie/Heaven-Discord-Bot' &&
    lessons?.parentLessonContentExported === false &&
    lessons?.feedbackContract === 'heaven-toolbox/child-feedback/v1' &&
    Array.isArray(lessonEvidence) && lessonEvidence.length >= 3 &&
    new Set(lessonEvidence.map(row => row.id)).size === lessonEvidence.length;
  if (!lessonCoverage ||
      !(await Promise.all(lessonEvidence.map(async row =>
        (await content(root,row.source)) !== null &&
        (await content(root,row.test)) !== null
      ))).every(Boolean)) {
    blockers.add('LESSON_ADOPTION_UNVERIFIED');
  }

  const contractValid = await inspectGeneratedContract(root);
  if (!contractValid) blockers.add('APP_PLATFORM_CONTRACT_INVALID');
  // This local source inspector has no independently authenticated parent
  // receipt transport. A generated manifest or workflow is not that receipt.
  // Keep release held until the reviewed parent authority is wired end to end.
  blockers.add('APP_PLATFORM_QUALITY_UNVERIFIED');

  const repoUpdate = await json(root, '.heaven/update-policy.json');
  const repoWorkflow = await content(root, '.github/workflows/heaven-autoupdate-policy.yml');
  if (repoUpdate?.schema !== 'heaven-toolbox/update-policy/v1' ||
      repoUpdate?.repository !== 'fengie/Heaven-Discord-Bot' ||
      repoUpdate?.kind !== 'product' || repoUpdate?.branch !== 'main' ||
      repoUpdate?.source_update?.strategy !== 'ff-only' ||
      repoUpdate?.source_update?.required !== true || repoWorkflow === null) {
    blockers.add('REPOSITORY_UPDATE_POLICY_MISSING');
  }

  const applicationUpdate = await json(root, '.heaven/app-update-policy.json');
  const updater = await content(root, 'scripts/Apply-HeavenBotUpdate.ps1');
  const lifecycleTests = await content(root, 'test/update-lifecycle.test.mjs');
  if (repoUpdate?.runtime_update?.mode !== 'apply-script' ||
      repoUpdate?.runtime_update?.apply_script !== 'scripts/Apply-HeavenBotUpdate.ps1' ||
      applicationUpdate?.apiVersion !== 'heaven.update/v1' ||
      applicationUpdate?.capability !== 'release.autoupdate' ||
      applicationUpdate?.mode !== 'required' ||
      applicationUpdate?.integrity?.signedMetadata !== true ||
      applicationUpdate?.integrity?.artifactDigest !== true ||
      applicationUpdate?.transaction?.rollbackRequired !== true ||
      applicationUpdate?.transaction?.atomicHandoff !== true ||
      applicationUpdate?.transaction?.installedIdentityVerification !== true ||
      updater === null || lifecycleTests === null) {
    blockers.add('AUTOMATIC_RUNTIME_UPDATE_MISSING');
  }

  return {
    schema: 'heaven-discord-bot/release-inheritance-check/v1',
    ready: blockers.size === 0,
    blockers: [...blockers].sort(),
  };
}
