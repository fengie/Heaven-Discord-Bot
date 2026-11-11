import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

async function content(root, relative) {
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
  if (!validParent || !Array.isArray(capabilities) ||
      !capabilities.includes('core.logging') ||
      !capabilities.includes('release.autoupdate') ||
      mapped?.schema !== 'heaven-toolbox/child-component-adoption/v1' ||
      mapped?.toolboxRevision !== parentRevision ||
      !Array.isArray(mapped.verifiedComponents) ||
      mapped.verifiedComponents.length < 2) {
    blockers.add('TOOLBOX_CAPABILITIES_UNADOPTED');
  }

  const lessons = await json(root, '.heaven/lesson-adoption.json');
  if (!validParent || entry?.feedback?.automaticParentWrite !== false ||
      entry?.feedback?.automaticChildUpdate !== false ||
      !entry?.toolbox?.lessonCatalogPath || !entry?.toolbox?.skillRootPath ||
      lessons?.schema !== 'heaven-toolbox/child-lesson-adoption/v1' ||
      lessons?.toolboxRevision !== parentRevision ||
      !Array.isArray(lessons.reviewedTests) || lessons.reviewedTests.length < 1) {
    blockers.add('LESSON_ADOPTION_UNVERIFIED');
  }

  const app = await json(root, 'app-spec.json');
  const manifest = await json(root, '.heaven/manifest.json');
  const quality = await json(root, '.heaven/quality-plan.json');
  if (app?.apiVersion !== 'heaven.app/v1' ||
      !app?.targets?.includes('server') ||
      !Array.isArray(app.capabilities) ||
      manifest === null || quality === null ||
      (await content(root, '.github/workflows/app-platform-quality.yml')) === null) {
    blockers.add('APP_PLATFORM_QUALITY_UNVERIFIED');
  }

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
