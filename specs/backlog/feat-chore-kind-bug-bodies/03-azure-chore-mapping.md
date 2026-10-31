---
github_issue_id: "#78"
---

# Phase 3 — Azure: chore in `workItemTypeByKind` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-push` on a `chore-` spec mints `workItemTypeByKind.chore`
when set and the default `workItemType` when not.

## Tasks

- [ ] `packages/azure-boards/src/cli-sync.js` `specKindOf`: recognise the
      `chore-` prefix → `'chore'`.
- [ ] `packages/azure-boards/src/config.js`: add `'chore'` to the allowed
      kinds (`['feature', 'bug', 'hotfix']` at ~196) and to the
      `workItemTypeByKind` doc comment (~48), naming the custom inherited
      `Chore` type consumers create.
- [ ] Update `docs/azure-boards.html` (`workItemTypeByKind` section) and bump
      its `verified:`, same commit.
- [ ] Tests: mint with `{ "chore": "Chore" }` uses `Chore`; mint with no
      `chore` mapping falls back to `workItemType` — one test each (the
      acceptance pair). Typecheck + tests green.
