---
github_identifier: "#69"
github_url: "https://github.com/SkitterByte/skitterspec/issues/69"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Bug: board add loses the race to auto-add sub-issues

> **Type:** Bug
> **Name:** bug-board-add-race (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixed (green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-29
> **Area:** packages/github/src/api.js
> **Stack:** worktree

## Symptom

Linking `feat-tracker-boundary` (5 phases) stopped part-way, twice:

```
spec-sync apply: GitHub refused the request: Content already exists in this project
  created but not stamped: #65 — stamp them with `spec-sync stamp` before re-running,
  or the next apply mints duplicates
```

The same happened for #67 on the re-run, while #64, #66 and #68 went through.
Each failure left a created, linked sub-issue that was not stamped into the
spec, which had to be stamped by hand to avoid a duplicate on the next run.

## Root cause

`addToBoard` (`packages/github/src/api.js:649`) trusts the issue it was handed.
A just-created child comes from the REST create, so its `boardItemId` is always
`null`, and the function sends `addProjectV2ItemById`. Its comment says the
mutation "returns the EXISTING item when the issue is already there". That is
not true when the add runs **alongside** the board's own "auto-add sub-issues"
workflow, which puts the child on the board as soon as it is linked under a
parent that is already there. Whichever add lands second is refused with
`Content already exists in this project`, so the outcome depends on timing.
That fits the alternating pass/fail.

## Failing test (red)

`packages/github/test/api.test.js` — *a board add that loses the race to
auto-add uses the item already there*, plus *setting Status on a just-created,
just-auto-added issue completes* and *the auto-added item is waited for while
GitHub has not shown it yet*. Run: `cd packages/github && node --test test/api.test.js`.

```
✖ a board add that loses the race to auto-add uses the item already there
  GitHubRefusal: GitHub refused the request: Content already exists in this project
```

The two `STAYS LOUD` tests beside them pass before and after the fix. Another
refusal is never read as already-there, and an item that never appears re-raises
the original refusal rather than being guessed.

## Fix

- [x] On that one refusal, re-read the issue and use its board item. Retry the
      read a few times with a short backoff while GitHub has not shown the item
      yet. If it never appears, re-raise the original refusal
- [x] Correct `addToBoard`'s comment about idempotency
- [x] Failing tests pass (GREEN); run the full suite — no regressions

## Impact

_No external surface changes — internal refactor only._

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-29 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-29 — Bug reproduced; failing test added (red).
- 2026-10-29 — Fixed: `addToBoard` reads the item back on `already exists`, with a
  short backoff, and re-raises if it never appears; tests green (4268 passed).
