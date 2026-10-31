---
github_issue_id: "#78"
---

# Phase 3 — Azure: chore in `workItemTypeByKind` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-push` on a `chore-` spec mints `workItemTypeByKind.chore`
when set and the default `workItemType` when not.

## Tasks

- [x] `packages/azure-boards/src/cli-sync.js` `specKindOf`: recognise the
      `chore-` prefix → `'chore'`. (Also widened the slug regex at ~463.)
- [x] `packages/azure-boards/src/config.js`: add `'chore'` to the allowed
      kinds (`['feature', 'bug', 'hotfix']` at ~196) and to the
      `workItemTypeByKind` doc comment (~48), naming the custom inherited
      `Chore` type consumers create.
- [x] Update `docs/azure-boards.html` (`workItemTypeByKind` section) and bump
      its `verified:`, same commit. (The page itself names no config keys —
      the key reference lives in `azure-boards.config.md` and the
      `spec-azure-setup` skill, both updated; `verified:` bumped after
      re-reading.)
- [x] Tests: mint with `{ "chore": "Chore" }` uses `Chore`; mint with no
      `chore` mapping falls back to `workItemType` — one test each (the
      acceptance pair). Typecheck + tests green. (130 pass in
      `packages/azure-boards`.)
