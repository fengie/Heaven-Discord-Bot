const SHA = /^[a-f0-9]{40}$/;
export function buildChildFeedback({childRevision,toolboxRevision}) {
  if (!SHA.test(childRevision??'')) throw new TypeError('INVALID_CHILD_REVISION');
  if (!SHA.test(toolboxRevision??'')) throw new TypeError('INVALID_PARENT_REVISION');
  return {
    schema:'heaven-toolbox/child-feedback/v1',
    repository:'fengie/Heaven-Discord-Bot',
    childRevision,toolboxRevision,
    findings:[
      {
        id:'bot-update-atomic-01',
        kind:'implementation',topic:'release.update-atomicity',
        summary:'Versioned bot update staging and rollback must preserve the prior release after interrupted promotion and reject unexpected source paths.',
        applicability:'portable',
        capabilities:['release.autoupdate'],
        evidence:[{path:'test/update-lifecycle.test.mjs',kind:'test'}],
        verification:{status:'unverified'},
      },
      {
        id:'bot-host-boundary-01',
        kind:'lesson',topic:'deployment.host-identity',
        summary:'A public Discord child must refuse installation on non-owner machines and isolate the bot task from other active Windows workloads.',
        applicability:'portable',
        capabilities:['runtime.background-jobs'],
        evidence:[{path:'test/windows-bootstrap-contract.test.mjs',kind:'test'}],
        verification:{status:'unverified'},
      },
      {
        id:'bot-inheritance-hold-01',
        kind:'negative-result',topic:'inheritance.source-not-runtime',
        summary:'Pinned parent policy references and passing public child CI did not establish an inherited executable updater or a deployed H1 service.',
        applicability:'portable',
        capabilities:['release.autoupdate'],
        evidence:[{path:'docs/toolbox-inheritance-acceptance.md',kind:'research'}],
        verification:{status:'unverified'},
      }
    ]
  };
}


const CHILD_REPOSITORY = 'fengie/Heaven-Discord-Bot';
const PARENT_REPOSITORY = 'fengie/heaven-toolbox';
const CAPABILITY = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

/**
 * The portable feedback revision must be the one declared by this exact
 * child's subscription, never an independently asserted agent-entry SHA.
 * This verifies committed lineage metadata, not installed runtime adoption.
 */
export function resolveFeedbackToolboxRevision(entry, subscription) {
  const capabilities = subscription?.capabilities;
  if (entry?.schema !== 'heaven-toolbox/child-agent-entry/v1' ||
      entry?.toolbox?.repository !== PARENT_REPOSITORY ||
      !SHA.test(entry.toolbox.revision ?? '') ||
      subscription?.schema !== 'heaven-toolbox/child-subscription/v1' ||
      subscription.repository !== CHILD_REPOSITORY ||
      !SHA.test(subscription.toolboxRevision ?? '') ||
      Object.keys(subscription).some(k => !['schema','repository','toolboxRevision','capabilities'].includes(k)) ||
      !Array.isArray(capabilities) || capabilities.length > 32 ||
      capabilities.some(x => typeof x !== 'string' || x.length > 96 || !CAPABILITY.test(x)) ||
      new Set(capabilities).size !== capabilities.length) {
    throw new TypeError('CHILD_FEEDBACK_INHERITANCE_INVALID');
  }
  if (entry.toolbox.revision !== subscription.toolboxRevision) {
    throw new TypeError('CHILD_FEEDBACK_PIN_MISMATCH');
  }
  return subscription.toolboxRevision;
}
