# Phase 1 — Withhold unstarted phases from the projection ✅

> **Status:** Done

## Goal

`mapping.phases: "deferred"` stops the projection from minting sub-issues for a
spec that has not been started, without changing anything for a spec that has.

## Tasks

- [x] Add `PHASE_MAPPINGS = Object.freeze(['subissue', 'deferred'])` to
      `packages/linear/src/config.js` and validate `mapping.phases` against it in
      `mergeConfig`, throwing the same shape of error as `mapping.tasks` does. It
      is currently copied with `assign(..., 'string')` and never checked.
- [x] Export `PHASE_MAPPINGS` alongside `TASK_MAPPINGS`.
- [x] In `normalizeLocal` (`packages/sync-core/src/normalize.js`), compute
      `workflowState` **before** building `subIssues` — it is currently derived
      last, and the withhold rule needs it.
- [x] Withhold when `mapping.phases === 'deferred'` and that status is `backlog`
      or `cancelled`: drop phases whose `id` is null from `subIssues`. A phase
      with an id always projects (Decision 3), so switching modes never strands a
      live sub-issue.
- [x] Keep `## Phases` in the description when the withhold actually dropped a
      phase (Decision 5). Leave `phasesProjected` untouched in every other case
      so no existing spec's description hash moves.
- [x] Tests in `packages/sync-core/test/` — cover: default `subissue` mode
      projects every phase (regression, byte-identical to today); `deferred` +
      backlog withholds unlinked phases and keeps the `Phases` section;
      `deferred` + backlog **keeps** a phase that already has an id, and then
      strips `Phases` only if nothing was withheld; `deferred` + `in-progress`
      projects everything; `deferred` + `cancelled` withholds; a `spec_status`
      frontmatter override drives the withhold, not the folder (Decision 4).
- [x] Test in `packages/linear/test/` that `mapping.phases: "nonsense"` throws
      and that `"deferred"` loads clean.
- [x] Assert the transition end to end: a withheld backlog spec produces a plan
      with zero sub-issue creates; move it to `in-progress` and the same spec
      plans exactly `N` creates against the same snapshot — proving the deferral
      needs no new snapshot state (Decision 7).
- [x] Run the full suite; it must be green before the phase is done.
