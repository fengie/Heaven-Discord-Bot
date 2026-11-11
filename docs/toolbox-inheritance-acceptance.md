# Toolbox inheritance and release acceptance

Status on November 11, 2026: **HOLD — NOT RELEASE-READY / NOT DEPLOYED**.

Public child: `fengie/Heaven-Discord-Bot`. Canonical private parent: `fengie/heaven-toolbox`. Latest inspected Toolbox main: `db8ed2ea26442c12c60731d9c2f5b3518d41000d`. This child still carries the separately reviewed pinned agent-entry revision `99312862f27cb9bba848cebc44317fd41b6651aa`. A reference or subscription does not install or expose a capability. Private Toolbox code, research, internal lessons, host configuration, tokens and HMAC keys must **not** be copied to this public repository without an explicit reviewed export boundary.

## Verified baseline and missing implementation

The child has safe, non-authorizing AGENTS/agent-entry/skill-catalog references and a bare `toolbox-subscriptions.json` with zero actual capability subscriptions. Bot commands and credential-free CI build were tested; Discord guild registration succeeded. There is **no** independently verified H1 bot installation, automatic updater, native lifecycle rollback, parent quality adoption, lesson transfer, or bidirectional feedback delivery.

The executable `src/release-inheritance.mjs` checks actual child source paths and independently reconstructs a source-only readiness result. It never treats an authored `ready:true` assertion as evidence, imports private parent modules into the public app, or authorizes host access. Both the native Windows and legacy WSL installers are held before any host mutation, and Gateway startup fails before token access. **Earlier immutable installer commits remain downloadable and cannot be remotely revoked; do not run those previously supplied commands.**

## Completion criteria and current owners

1. **Full App Platform adoption:** existing-repository adoption belongs to [Toolbox PR #1364](https://github.com/fengie/heaven-toolbox/pull/1364), which remains unmerged and has non-green exact-head checks. Preserve customized child README/source and reconcile generated path conflicts rather than overwriting. The child-side intent proposal is `docs/proposed-app-spec.json` (not an installed/generated contract). After integration, reconcile that intent with existing source, obtain an owner-reviewed `app-spec.json` targeting `server`, the generated `.heaven/manifest.json`, `.heaven/quality-plan.json`, and `.heaven/app-update-policy.json`, then run the **real** parent App Platform quality gate at a trusted pinned revision. A local copy of a private module is not valid inheritance.
2. **Repository update contract:** the parent requires `.heaven/update-policy.json` and the Heaven AutoUpdate Contract workflow on every PR/main push; product repositories cannot use `runtime_update.mode=none`. The parent managed catalog currently lacks this bot; PR #1364 proposes `source`/`none` registration, which must be updated after a real product updater is accepted. The bot must use `product` plus a tested `apply-script` strategy or approved release channel, with canonical `ff-only` source convergence.
3. **Automatic runtime updating:** implement an owned, bounded, console-free H1 update mechanism with authenticated source/publisher identity and artifact digests, isolated staging, validation before replacement, atomic handoff, interrupted-update recovery and rollback, repeat-safe checks, protected existing secrets/Windows task, owned-only cleanup, and independently confirmed post-apply installed SHA/Gateway health. The existing installer refuses updated main rather than applying it; that is not an auto updater. Require negative tests for corrupted downloads, stale source, wrong host and occupied/foreign task.
4. **Lessons and feedback:** the private Toolbox skills/lesson index are navigation references, **not** content inherited by the public bot. Adopt specific reviewed generic invariants with executable regression tests and exact parent/child SHAs, maintain a reviewed metadata-only `heaven-toolbox/child-feedback/v1` packet, and route it through existing parent findings/impact owners. Public actions may not read private parent source or grant parent write access. The parent read-only impact planner is not an automatic rollout mechanism.
5. **Host acceptance:** keep the release hold until source contracts and independent exact-tree CI are green, then verify real physical Heaven1 identity, private credential provisioning, non-disruptive service ownership, running source SHA, actual `discord.ready`, and a working `/ping` response. An H1 install is not proven by GitHub Actions or Discord command registration.

The existing [bot deployment issue #5](https://github.com/fengie/Heaven-Discord-Bot/issues/5) tracks physical runtime acceptance. [Toolbox issue #270](https://github.com/fengie/heaven-toolbox/issues/270) owns generic App Platform adoption/learning. Any release-hold removal must be a separately reviewed code change that preserves the tested deployment and update gates, not a hand-edited status flag.

## Release state

SOURCE_BASELINE_REFERENCED: true

COMPONENTS_ADOPTED: false

APP_PLATFORM_QUALITY_VERIFIED: false

AUTOUPDATE_AND_ROLLBACK_PROVEN: false

LESSONS_AND_FEEDBACK_OPERATIONAL: false

H1_RUNTIME_VERIFIED: false

RELEASE_READY: false
