# Phase 1 — Tag only after a successful publish 🔄

> **Status:** In progress

**Goal:** a failed publish leaves no tag, so the tag list only ever asserts
releases that reached npm.

## Tasks

- [ ] RED — update the step-ordering test in `scripts/release.test.js` to expect
      `pnpm publish` **before** `git tag`, and watch it fail against the current
      order.
- [ ] RED — add a test that the tag step is `phase: 'local'` and is the **last**
      step, so `--yes` without `--publish` still tags.
- [ ] Swap the two `steps.push` calls in `buildPlan` (`release.js:158-165`).
- [ ] Add a test asserting the invariant directly rather than by position: the
      index of the publish step is less than the index of the tag step whenever
      both are present.
- [ ] Document the ordering in `RELEASING.md`, including Decision 2 — a publish
      that succeeds but fails to tag leaves a published version to be tagged by
      hand, which is the deliberate trade.
- [ ] Delete the phantom tag: `git tag -d skitterspec@16.3.1` (local only —
      confirm it is absent from origin first).
- [ ] GREEN — `node --test scripts/release.test.js` green; full suite green.
