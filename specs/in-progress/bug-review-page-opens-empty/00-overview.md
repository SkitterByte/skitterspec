---
linear_identifier: "SKS-377"
linear_url: "https://linear.app/skitterbyte/issue/SKS-377/bug-the-review-page-opens-with-no-diff-on-it"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the review page opens with no diff on it

> **Type:** Bug
> **Name:** bug-review-page-opens-empty (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-21
> **Area:** `packages/common/src/env/serve.js`, `packages/common/src/env/review.js`

## Symptom

A spec was written with `/spec`, the run reported `Review ready — 6 files, +438 −0`,
and the served page was opened at `http://127.0.0.1:7715/<token>/feat-budget-total-calculation`.

The main column held the WHY card, the `Where this runs` block and the verdict
strip — and **no diff at all**. The file tree listed all seven files; clicking
any one of them made that file appear. The page also showed `7 files, +454 −0`
where the run had said six, `Show bookkeeping (7)`, and the **committing**
verdict strip (`Commit`, `Commit & Continue`) on a spec that has no phase in
flight.

Both halves are one page's worth of wrong: the CLI render was correct and only
the daemon's re-render was not.

## Root cause

Two causes, independently sufficient, both ending in an empty main column.

**One — the view.** `viewFor` asks `docsWorktree` whether a spec's worktree is a
spec being *written*, and that function disqualified the tree over **any**
uncommitted path that is not the spec's own documents
(`packages/common/src/env/serve.js:214`). The linking push writes a tracker
snapshot into that same tree — `specs/.core/linear-base/<ID>.base.json` — and a
project that has not declared it in `spec.companionPaths` therefore has exactly
one foreign path sitting beside the spec at the moment the page is opened. The
view fell through to `worktree`, where `isNoise` marks every `specs/**` path as
bookkeeping — which is every file there is on an authoring page.

**Two — the collector.** Bookkeeping is defined *relative to* the code beside
it: a spec's own checkbox edits are not what anyone came to read when there is a
diff to read. `collectReview` applied that with no relative left
(`packages/common/src/env/review.js:283`), so a change that is nothing but
bookkeeping folded **all** of itself away. That is reachable without cause one —
an ordinary phase that only edits its own spec documents lands on it.

## Failing test (red)

`packages/common/test/env-review-nothing-open.test.js` — run with
`node --test packages/common/test/env-review-nothing-open.test.js`.

- *a tracker snapshot beside an authored spec does not cost it its page* — the
  served page's button set and which files are open.
- *the served page shows the same files the CLI rendered* — the snapshot is not
  one of them.
- *a change that is nothing but bookkeeping is the thing to read* — `collectReview`
  over a spec-documents-only diff.

Red output before the fix:

```
✖ a tracker snapshot beside an authored spec does not cost it its page
  Expected values to be strictly equal: 'committing' !== 'authoring'
✖ a change that is nothing but bookkeeping is the thing to read
  with nothing else in the diff, the bookkeeping IS the diff
```

Three stays-silent tests ship beside them
(`.claude/rules/negative-checks.md` rule 3): an authoring tree with no snapshot,
**real code** beside the spec (still a worktree view — the line the fix must not
cross), and bookkeeping beside code (still folded away).

## Fix

- [x] `docsWorktree` tolerates project bookkeeping — `specs/.core/**` — beside
      the spec's own documents, and disqualifies everything else exactly as
      before. The rendered file set is unchanged: the page still shows `owned`.
- [x] `collectReview` un-folds a change whose files are **all** bookkeeping,
      since there is nothing left for them to be bookkeeping *beside*.
- [x] Failing tests now pass (GREEN); `node --test` across the repo — no
      regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Review page | update | a served authoring page survives a tracker snapshot in its tree |
| Review page | update | an all-bookkeeping diff renders open instead of empty |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-21 — Bug reproduced; failing tests added (red).
