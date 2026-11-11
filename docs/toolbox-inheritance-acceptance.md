# Heaven Discord Bot — Toolbox inheritance acceptance

Status November 11, 2026: **SOURCE UPDATER TESTED; APP PLATFORM QUALITY PENDING; H1 NOT DEPLOYED**.

This public repository inherits reviewed, applicable engineering contracts from the private `fengie/heaven-toolbox` parent without exporting private source, credentials, internal lessons, or machine authority. Pin: `99312862f27cb9bba848cebc44317fd41b6651aa`. Canonical parent adoption owner: [Toolbox PR #1364](https://github.com/fengie/heaven-toolbox/pull/1364) / issue #270. User-facing physical deployment: [bot issue #5](https://github.com/fengie/Heaven-Discord-Bot/issues/5).

## Implemented and source tested

- Explicit product App Spec (`app-spec.json`) targets `server` with applicable `core.logging`, `network.http`, `runtime.background-jobs`, and `release.autoupdate`.
- Distinct repository policy `.heaven/update-policy.json` (`product`, ff-only main consumption, apply-script) and application policy `.heaven/app-update-policy.json` (stage, integrity, rollback, install identity).
- Public child-local `Heaven AutoUpdate Contract` workflow runs on every PR and main push with read-only GitHub permission, without private parent workflow calls or access grants.
- `scripts/Apply-HeavenBotUpdate.ps1` is the product-specific H1 adapter for the *existing* Toolbox repository auto-updater, not a second scheduler. It verifies physical HEAVEN and task ownership, clean current canonical source, published GitHub main and its verified signature before stopping the bot task, stages with file/hash validation, runs locked-dependency tests, applies the candidate, requires a new Gateway-ready event and rolls back on failure.
- `src/update-transaction.mjs` implements bound, owner-only staging, atomic same-volume app/pointer promotion, rollback journal, recovered interrupted updates and retained previous release. `test/update-lifecycle.test.mjs` runs real temporary-directory transitions and negative cases on Linux and native Windows CI. The updater **has not run on real H1**; native parser/test success is not deployed proof.
- npm's complete dependency graph is committed in `package-lock.json` and all CI/container/host install steps use `npm ci`. Checks verify integrity-pinned transitive packages.
- `.heaven/component-adoption.json`, `.heaven/lesson-adoption.json` and `.heaven/toolbox-subscriptions.json` map only relevant bot capabilities/invariants to **actual child source and regression tests**. These are source-level equivalent implementations, **not** evidence that private Toolbox modules or every private lesson were copied, installed, independently reviewed or executed on H1.
- `src/child-feedback.mjs` and `scripts/emit-toolbox-feedback.mjs` produce metadata-only `heaven-toolbox/child-feedback/v1` packets at a clean, exact child Git revision. Public main CI emits the packet for private parent review; it cannot automatically write to or grant access to the parent. The existing parent findings/lesson/impact owner must independently verify and promote applicable feedback.

## Remaining production blockers

1. **App Platform generation and independent quality:** The existing checked-out repository adoption implementation in [parent PR #1364](https://github.com/fengie/heaven-toolbox/pull/1364) has not been integrated. The child App Spec is present, but the canonical parent-generated `.heaven/manifest.json` and `.heaven/quality-plan.json` plus independent quality check are **not** yet available. Do not manufacture these files or weaken the source release guard. After parent integration, run its real `heaven-app adopt` only on a reconciled source checkout and use the parent `heaven-app quality` gate; preserve the bot's customized README, AGENTS and product files. Path conflicts are HOLDs.
2. **Parent catalog product registration:** The live private parent managed catalog does not yet declare this bot as a runnable product with `runtime_mode=apply-script`. Parent PR #1364 proposes only source-only enrollment. Reconcile its catalog after source adoption; do not introduce a second updater service.
3. **Real H1 operational acceptance:** The existing Toolbox Bridge ingress and H1 runtime health remain unverified. The H1 task credentials are only stored when locally entered using same-user DPAPI; GitHub Actions secrets cannot be read back or copied automatically. Only a fresh authorized H1 runtime/test can verify installed source SHA, restart behavior, live Discord `/ping`, and an actual old→new→rollback update trial.
4. **Private parent promotion:** Source feedback packet is non-authoritative. Parent issue #270/lesson owners must read back child exact Git source and tests before claiming bidirectional transfer or parent policy adoption. Do not equate a public CI log with a parent merge or release.

## Release boundary

The native PowerShell and legacy WSL installer on current main are intentionally held before host-side mutation, and `src/index.mjs` prevents Gateway login until the *source* App Platform admission succeeds. Previously supplied immutable installer URLs remain accessible and must not be run. Only remove these holds through separately tested, reviewed source after the parent quality contract passes; keep target-specific deployment proof independent of source admission.

No host, permission, secret or global Toolbox deployment changes have been performed by this public source work.
