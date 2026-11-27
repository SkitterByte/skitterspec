---
github_identifier: "#351"
github_url: "https://github.com/SkitterByte/skitterspec/issues/351"
---

# Bug: epic status counts a backlog member's docs-only worktree as in flight

> **Type:** Bug
> **Name:** bug-epic-docs-worktree-in-flight (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/351
> **Area:** packages/common/src/env/epic.js, packages/common/test/env-epic-status.test.js, packages/common/test/env-epic-clashes.test.js
> **Severity:** 3 - Medium
> **Docs:** none: no page describes how a member is judged in flight; review.html's epic-page prose stays true

## Symptom

`/spec` writes each new spec in its own documents-only worktree
(`spec-env up <name> --docs`). Under `land.specDocs: "branch"` a `Commit`
verdict keeps that worktree as the spec's working copy, so a member that is
Ready in `backlog/` and was never started still has a worktree on disk.
`epic status` then counts it as in flight:

- it uses up a lane, so `freeLanes` reads 0 when nothing is being built;
- its step is `verb: "next"` / `/spec-next` in that tab, which would build a
  phase of a spec `/spec-start` never ran;
- `epic check` at `/spec-start` warns that members clash on files, because
  the other docs-only members look in flight too.

Repro: in `epic-live-workbench`, `feat-live-db-snapshot` and
`feat-drop-spec-connect` were in backlog on their own branches with docs
worktrees. `skitterspec epic status epic-live-workbench --json` listed both
under `groups.inFlight`, with `freeLanes: 0` and `/spec-next` steps.

Expected: a member whose own copy is still in `backlog/` reads as ready (or
waiting), with `/spec-start <member>` in a new tab, holds no lane, and raises
no clash.

## Root cause

`epicStatus` (`packages/common/src/env/epic.js:342`) filed a member as
`in-progress` whenever it had a worktree whose own copy was not `complete` or
`cancelled`. That made the worktree itself the in-flight signal, which held
while worktrees came only from `/spec-start`. The docs lane broke the
assumption, because its worktree's copy says `backlog`. Everything else
(lanes, steps, `memberCheck`'s clashes) reads `inFlight`, so the one
misfiling showed up in all three places.

## Failing test (red)

`a member whose worktree copy is still in backlog is not in flight` in
`packages/common/test/env-epic-status.test.js`. It gives a member a worktree
whose copy is in `backlog` and asserts it is not in flight, is ready, and
leaves both lanes free. Run with
`node --test packages/common/test/env-epic-status.test.js`.

```
✖ a member whose worktree copy is still in backlog is not in flight
  + [ 'feat-free-authoring-safety' ]
  - []
```

## Fix

- [x] Take a worktree copy's `backlog` bucket as the member's bucket. Only a
      copy in another bucket (`in-progress`), or an unreadable one, counts as
      in flight. In flight is the harmless side of a cannot-tell, because it
      offers no start.
- [x] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [x] Add a stays-silent clash test: a clashing member whose worktree copy is
      in backlog raises no `memberCheck` warning.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `epic status` / `epic check`: a backlog member with a docs worktree is ready, holds no lane, clashes with nothing |

## Changelog

- 2026-11-27 — Bug reproduced; failing test added (red).
- 2026-11-27 — Fixed: a worktree copy in `backlog` files the member there; test green.
- 2026-11-27 — Completed; tests green. `reference.html` covers `epic.js`. It
  was re-read, found still true, and stamped.
