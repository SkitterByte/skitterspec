---
github_issue_id: "#94"
---

# Phase 1 — Engine: `pull` ownership, transition-only state writes, live status read ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `sync.fieldOwnership: "pull"` works for `workflowState` and `assignee`
in sync-core and provider-kit, proven by tests. Defaults are not flipped yet
(phase 4).

## Tasks

- [ ] Add an ownership helper beside `ownsField` (`sync-core/src/normalize.js`)
      that answers `push` / `pull` / `none`. Keep `ownsField` meaning "in play at
      all", so existing callers keep working.
- [ ] Under `pull`, omit the field from routine projections and comparisons
      (`toFieldSet`, `compare.js`), so a push never sends it and `/spec-status`
      never reports it as drift.
- [ ] Add a transition push: an explicit `--transition <bucket>` (or an
      equivalent plan input) that carries `workflowState` even under `pull`. It is
      used only by create, start, complete and cancel.
- [ ] Add a `readStatus` adapter call to all four providers that returns
      `{ state, bucket, assignee }` or `cannot-tell`. Reuse `remoteStateReading`
      for the bucket mapping. An unmapped state is `bucket: null` and is never a
      disagreement.
- [ ] Assignment under `pull`: `assign --to` / `--release` write the tracker
      directly and stamp no frontmatter. Add `assign --if-unassigned` for
      `/spec-start`. Under `push`, today's behaviour is unchanged.
- [ ] Tests: pull omits the field from the plan; a transition carries it; a
      routine push after a board change sends no state (a stays-silent test);
      `readStatus` cannot-tell paths; `--if-unassigned` leaves an assigned ticket
      alone (a stays-silent test). Run `pnpm test` — green.

## Notes

- `pull` must never mean "copy into the repo". Nothing read is written to a spec
  file. Name that blind spot in a comment beside the helper.
