# Phase 2 — Render them, and guard the writers ⬜

> **Status:** Not started

**Goal:** the newly-claimed bullets reach the sub-issue description as plain
bullets, and no writer mistakes one for a task.

## Tasks

- [ ] RED — extend `sync-task-checklist.test.js`: a phase file with a
      non-checkbox subtree bullet projects it into the `## Tasks` checklist as
      `<indent>- <text>`, with indentation and source order preserved and no
      `[ ]` invented.
- [ ] Branch on `b.checkbox` in `normalize.js:350` — checkbox blocks keep
      `- [x]`/`- [ ]`, non-checkbox blocks render `- ` only. Keep the existing
      inline `(KEY-123)` stripping for both.
- [ ] Skip non-checkbox blocks in `write.js` `stampIssueId` — it is the legacy
      per-task stamp and must never append an id to a plain bullet.
- [ ] Audit every other `findTaskBlocks` caller for the same assumption
      (`write.js:130`, `normalize.js:350`, the test helpers) and fix or assert
      each.
- [ ] Confirm the churn is `update`-only, never `create`: run
      `skitterspec spec-sync push --json` over this repo's linked specs and
      record the create/update counts in the Changelog (precedent:
      `feat-linear-mirror-fidelity` Decision 7).
- [ ] GREEN — full suite green; add a `Release-Note:` on the commit, since the
      mirror gains content users were missing.
