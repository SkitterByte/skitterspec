---
github_issue_id: "#66"
---

# Phase 3 — Remove the stage ladder ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** nothing in skitterspec moves a ticket's state past `complete`.

## Tasks

- [x] Remove Linear's `stage` verb, `partitionStageMoves`, `stageOrderWarning`
      and the ladder wiring in `cli-sync.js`
- [x] `stage` refuses: exit 1, one line naming `released --json`
- [x] Remove `release.stages`, `releaseStages` and `stageFor` from all four
      `config.js`; keep `release.ignorePaths`
- [x] Remove the `release.stages` read in `sync-core/src/normalize.js` and the
      ladder lines in `doctor`; `doctor` names leftover `release.stages` as
      unused
- [x] Delete `cli-stage`, `cli-status-stage`, `sync-stage-not-drift` and
      `cli-states-vocabulary` tests; add a refusal test
- [x] Remove the ladder from sync-core (`stageForState`, `remoteStage`,
      `LADDER_ORIGIN_BUCKET`), Linear's `--stage` init flag, `states` output
      and doctor `ladder` row
- [x] Run typecheck + tests — green

## Notes

The split description/state hash in `sync-core/src/compare.js` stays: it is
still what makes a prose edit push without re-asserting state. Update its
comment, which names `release.stages` as the reason.
