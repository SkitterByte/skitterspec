---
github_issue_id: "#94"
---

# Phase 1 — Engine: `pull` ownership, transition-only state writes, live status read ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `sync.fieldOwnership: "pull"` works for `workflowState` and `assignee`
in sync-core and provider-kit, proven by tests. Defaults are not flipped yet
(phase 4).

## Tasks

- [x] Add an ownership helper beside `ownsField` (`sync-core/src/normalize.js`)
      that answers `push` / `pull` / `none`. Keep `ownsField` meaning "in play at
      all", so existing callers keep working.
- [x] Under `pull`, omit the field from routine projections and comparisons
      (`toFieldSet`, `compare.js`), so a push never sends it and `/spec-status`
      never reports it as drift.
- [x] Add a transition push: an explicit `--transition <bucket>` (or an
      equivalent plan input) that carries `workflowState` even under `pull`. It is
      used only by create, start, complete and cancel.
- [x] Add a `readStatus` adapter call to all four providers that returns
      `{ state, bucket, assignee }` or `cannot-tell`. Reuse `remoteStateReading`
      for the bucket mapping. An unmapped state is `bucket: null` and is never a
      disagreement.
- [x] Assignment under `pull`: `assign --to` / `--release` write the tracker
      directly and stamp no frontmatter. Add `assign --if-unassigned` for
      `/spec-start`. Under `push`, today's behaviour is unchanged.
- [x] Tests: pull omits the field from the plan; a transition carries it; a
      routine push after a board change sends no state (a stays-silent test);
      `readStatus` cannot-tell paths; `--if-unassigned` leaves an assigned ticket
      alone (a stays-silent test). Run `pnpm test` — green.

## Notes

- **The transition is detected, not declared.** No `--transition` flag: the
  state already has its own split hash (`issueFields.state`), and that hash
  changes exactly when the spec changes bucket, which only start, complete and
  cancel do. Under `pull` a state is sent on that positive signal, or on a create
  (no stamp yet), and never on the cannot-tell paths: an adopted issue with no
  snapshot, or a pre-split snapshot. `linked` is read from the issue stamp, not
  from `identifier`, because callers fall back to the folder name.
- **A pulled assignee is not projected at all**, so completing a spec no longer
  releases it. The board keeps who did the work.
- **`readStatus` is one kit function** (`provider-kit/src/status.js`). Every
  adapter's `readIssue` already returns `state: { name }` and `assignee`, and each
  provider's `config.remote.stateName` maps its own status, so a per-provider
  call would duplicate it four times. It is tested through each provider's loaded
  config. The CLI surface that calls it belongs to phase 3, its first consumer.
- **Jira has no assignment commands**, so `--if-unassigned` is wired for GitHub,
  Linear and Azure Boards.
- The neutral engine test config read `workflowState: 'pull'` back when `pull`
  was inert. It now reads `push`, so those tests keep exercising the repo-owned
  behaviour they were written for.

- `pull` must never mean "copy into the repo". Nothing read is written to a spec
  file. Name that blind spot in a comment beside the helper.
