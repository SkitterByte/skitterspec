# Phase 2 — `/spec-list` relays it on every path ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the skill keeps the local section on the API path and builds it on
the MCP path, so an unpushed spec is visible whichever transport answered.

## Tasks

- [x] In `packages/linear/assets/skills/spec-list/SKILL.md` step 3 (MCP), build the section from `spec-sync linked --json`: filter `identifier: null` to the scope's live buckets, using the heading and hint from decisions 1–2, and apply the `--mine`/`--by` rule from decision 6.
- [x] In step 5, add the section to the list of things that must reach the reader.
- [x] Have the report's `Next` row suggest `/spec-push <name>` when the only rows are local ones.
- [x] Run the skill-asset tests (e.g. any assets/skill lint in `pnpm test`) and get them green.
