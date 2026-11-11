# Toolbox child adoption trial — 2026-11-10

**Public child:** `fengie/Heaven-Discord-Bot` (repository ID 1453395734).
**Private parent:** `fengie/heaven-toolbox`.
**Reviewed child-agent policy pin:** `99312862f27cb9bba848cebc44317fd41b6651aa`.
**Initial child main:** `355ddb27d519900bdeabf55facb65f146117d7c2`.

## Observed defect and feedback

The initial attempt created the repository README and a bootstrap branch but did not generate App Platform files, register a verified child subscription, or run the inheritance and feedback checks. The parent `heaven-app generate` intentionally rejects an existing destination; normal GitHub repo initialization already creates one. The read-only inheritance planner does not perform onboarding.

Toolbox follow-up: reuse `renderScaffoldFiles` via an explicit `heaven-app adopt` path that checks the Git origin, preserves customized README, rejects path and content conflicts before mutation, and validates the exact generated contract. Track under Toolbox #270 without a parallel service.

## This child checkpoint

- `AGENTS.md` and `.heaven/agent-entry.json`: generated entry content from the reviewed Toolbox generator; policy references only, not agent authority or runtime capabilities.
- `.heaven/toolbox-subscriptions.json`: baseline-only subscription. No reusable product capability is claimed installed.
- `test/bootstrap-contract.test.mjs`: local source-contract consistency check, no parent access or credentials.
- No Discord application key, Gateway connection, bot commands, private Toolbox source export, host deployment, or release status is claimed.
- After the Toolbox adoption fix is integrated: run its `adopt` command in a clean, correctly authenticated checkout; review exact new files, run `quality`, CI, and only then publish the scoped child change. Preserve child customizations or record conflicts rather than overwriting.

## Feedback return path

Keep product-specific results here; for verified reusable findings, emit the existing `heaven-toolbox/child-feedback/v1` metadata contract with exact child and inherited Toolbox SHAs. Toolbox #270 owns triage and promotion. This negative-result record is intentionally retained rather than marked as a completed live inheritance cycle.
