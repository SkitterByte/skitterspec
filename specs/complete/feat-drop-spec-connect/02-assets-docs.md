---
github_issue_id: "#350"
---

# Phase 2 — Assets and docs point at `/spec-live` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-connect` is not installed or mentioned anywhere it ships, and
an upgrade removes the installed copy. Asset and init tests prove it.

## Tasks

- [x] Delete `assets/commands/spec-connect.md`. Register it as retired so
      `init`/`update` removes the installed copy, or keeps it when it was
      edited.
- [x] Remove `/spec-connect` from `claude-md-section.md`,
      `rules/spec-planning.md`, `commands/spec-live.md`, `spec-skip.md` and
      `spec-epic.md`, and point the try-it wording at `/spec-live` alone.
- [x] Skills: in `spec-start` (SKILL.md, isolation.md), `spec-next`,
      `spec-hotfix` (try a hotfix with `spec-env dev up`), `spec-complete` and
      `spec-cancel`, drop the connect and proxy steps.
- [x] `core/env.config.md`: remove the `proxy` block and document `live.host`.
- [x] Add a `MIGRATION.md` entry for each published package, and update the
      README(s), `docs/index.html` and `docs/reference.html`. Then run
      `node scripts/docs-freshness.js verify index reference`.
- [x] Add an asset test asserting no shipped asset names `/spec-connect`, and
      an init test for the retired-command removal.
- [x] Run `pnpm build` and `pnpm test` until green.
