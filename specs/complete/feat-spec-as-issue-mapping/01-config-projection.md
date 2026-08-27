# Phase 1 — Config + projection reshaped to issue/sub-issue ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `normalizeLocal` emits the new `{description, workflowState,
subIssues[]}` projection and `config.js` describes the issue/sub-issue model —
proven by unit tests on the projection shape and config validation.

## Tasks

- [x] Update `packages/linear/src/config.js` `DEFAULT_CONFIG`:
      `mapping` → `{specFolder:'issue', phases:'subissue', tasks:'none'}`; add
      `linear.projectId: ''`; remove `linear.initiativeId`; reword the `states`
      comment to **Issue workflow states** (not Project statuses);
      `sync.fieldOwnership` → `{description:'push', subIssues:'push',
      workflowState:'push'}` (drop `milestones`, `tasks`).
- [x] Update config validation/normalisation so an unknown `fieldOwnership` key
      set still enforces `both|pull|push`, and `mapping`/`projectId` round-trip.
- [x] Reshape `normalizeLocal` in `packages/sync-core/src/normalize.js`: replace
      the `milestones` + `tasks` extraction with a single `subIssues` array —
      one item per phase with `name` (phase title), `goal` (goal only, no task
      text), `state` (phase emoji → `states` bucket), and `ref` (phase-file
      basename). Drop the `tasks`/`taskBreakdown`/`acceptanceCriteria` projection
      members that no longer apply.
- [x] Add a phase-emoji → state-bucket helper (⬜→backlog, 🔄→in-progress,
      ✅→complete) reading the phase status from the phase index / heading;
      reuse the existing `EMOJI_STATUS` map.
- [x] Derive the spec issue's `workflowState` from the lifecycle **folder
      bucket** (`specs/<bucket>/`) when `spec_status` frontmatter is absent —
      real specs keep status in the `> **Status:**` header, not frontmatter, so
      the folder (the source of truth) drives the issue state. (Discovered via a
      live projection check — it was projecting `null`.)
- [x] Keep `buildDescription` stripping the `## Phases` index from the pushed
      description (still true — phases travel as sub-issues, not prose).
- [x] Leave `findTaskBlocks`/`renderTaskBlock` and the title/emphasis
      canonicalisation untouched — tasks are still parsed for the repo's own use
      (stamping, sanitise), just no longer projected to Linear.
- [x] Update `packages/sync-core/index.js` exports if any projection helper
      names change.
- [x] Add/adjust tests: `sync-normalize.test.js` asserts the new projection
      keys and that no task-level items appear; a phase with each emoji maps to
      the right sub-issue state; `packages/linear/test/config.test.js` asserts
      the new `mapping`/`projectId`/`fieldOwnership` defaults. Run the project's
      typecheck + test commands — green before the phase is done.

## Notes

`states` stays a single map used for BOTH the spec issue (folder bucket) and the
sub-issue (phase emoji) — no second map. `cancelled` only applies to the spec
issue (phases have no cancelled emoji).
