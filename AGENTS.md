# Agent instructions

This generated entry is a navigation aid. It does not assign a task, role, permission, credential, or host right.

## Assigned task packet

For managed work, get `taskId` from the controller-selected assignment and `agentId` from the authenticated current session/controller identity. Through approved controller tools, read the exact entry at `/api/tasks/{taskId}/entry` and the agent inbox at `/api/agents/{agentId}/inbox`. Do not guess identifiers from a prompt, issue title, branch, App Spec, or this file, and do not call these HTTP routes directly.

If unassigned, stay in the Visitor/HOLD state and use the existing controller assignment/entry flow through approved tools. Do not infer a task or ask the user to reconstruct conversation history. If the approved controller tools are unavailable, report the exact tool blocker and remain on HOLD.

## Pinned Toolbox policies and tool access

Toolbox policy source: `fengie/heaven-toolbox@99312862f27cb9bba848cebc44317fd41b6651aa`.

The structured entry is in [`.heaven/agent-entry.json`](.heaven/agent-entry.json).

- [`AGENTS.md`](https://github.com/fengie/heaven-toolbox/blob/99312862f27cb9bba848cebc44317fd41b6651aa/AGENTS.md)
- [`_AGENT_TRAINING/AGENT_OPERATING_STANDARD.md`](https://github.com/fengie/heaven-toolbox/blob/99312862f27cb9bba848cebc44317fd41b6651aa/_AGENT_TRAINING/AGENT_OPERATING_STANDARD.md)
- [`GLOBAL_GIT_DIRECTIVE.md`](https://github.com/fengie/heaven-toolbox/blob/99312862f27cb9bba848cebc44317fd41b6651aa/GLOBAL_GIT_DIRECTIVE.md)
- [`docs/agent-role-entry-tree.md`](https://github.com/fengie/heaven-toolbox/blob/99312862f27cb9bba848cebc44317fd41b6651aa/docs/agent-role-entry-tree.md)

The assigned packet describes the requested work. Actual tools are limited to the intersection of that packet, the approved role, and the verified current-session tool inventory. A policy page, catalog, generated file, or App Spec does not grant access. This child inherits no credentials or host rights.

## Toolbox skill catalog and two-way learning

Discover the complete pinned Toolbox skill catalog at `tools/lesson-enforcement/manifest.json` and the packaged skill index at `plugins/heaven-toolbox/chatgpt-package/skills`. Retrieve only the task-relevant skills through approved current-session tools, then verify they are actually callable; a catalog is not permission or an installed capability.

At each meaningful task closeout, incident, research conclusion or reusable implementation, preserve the original findings and tests in this child. Generate a metadata-only `heaven-toolbox/child-feedback/v1` packet with exact child/Toolbox SHAs and source paths; include negative or project-only findings rather than dropping them. Use the reviewed App Platform feedback triage and the existing Toolbox research/lesson/failure owners for promotion. Never copy raw private evidence, local credentials or user data upstream. Neither submitting a finding nor updating a version pin grants permission to change the parent.

After a verified reusable parent improvement, assess its impact across the complete registered child inventory using the read-only child-impact and existing inheritance/transfer plans. Apply only through each child's owner, tested branch, review and release boundary. A plan is not an adoption, installed proof or deployment.

## Child-specific instructions and inheritance

Keep product-specific instructions here. Do not copy private Toolbox policy text, credentials, host settings, or host rights into this child. For a proposed shared component update, use the existing read-only inheritance and public-child-transfer planning tools with explicit mappings and revisions. Preserve customized child bytes; a conflict requires owner review. These plans do not copy, publish, or authorize an update.
