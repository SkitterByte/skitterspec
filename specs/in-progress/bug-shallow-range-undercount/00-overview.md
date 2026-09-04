---
linear_identifier: "SKS-52"
linear_url: "https://linear.app/skitterbyte/issue/SKS-52/bug-a-shallow-clone-silently-undercounts-a-releases-tickets"
---

# Bug: a shallow clone silently undercounts a release's tickets

> **Type:** Bug
> **Name:** bug-shallow-range-undercount (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — fixed, tests green
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/linear/src/cli-sync.js, packages/linear/assets/core/ci-stages.md
> **Stack:** worktree

## Symptom

On a shallow clone, `spec-sync released` and `spec-sync stage` report **fewer
tickets than the range contains**, exit 0, and read as a clean run.

Reproduced against a six-commit origin tagged four commits back, so
`v1.0.0..HEAD` is always four commits and four tickets:

```
$ git clone --depth 2 <origin> ci && cd ci && git fetch --tags --force

FULL clone:     4 ticket(s) in 4 commit(s)   SKS-3 SKS-4 SKS-5 SKS-6
SHALLOW clone:  2 ticket(s) in 2 commit(s)   SKS-5 SKS-6        <- same command, exit 0
```

SKS-3 and SKS-4 simply vanish from the release. This is the CI case, not an
exotic one: `actions/checkout` defaults to `fetch-depth: 1`, and fetching tags
afterwards — which is what makes the tag resolvable — does **not** deepen the
history.

Two things make it invisible rather than merely wrong:

1. **The tag resolves.** `git rev-parse -q --verify v1.0.0^{commit}` exits 0 on
   the shallow clone, so any guard asking "does the base exist?" passes.
2. **`0 commit(s) carry no ref` is reported.** The counter that exists precisely
   to make a missed trailer visible confirms every commit is accounted for —
   because every commit *it can see* is.

For `stage --apply` the consequence is a wrong write, not just a wrong report: it
moves the tickets it happened to see and leaves the rest in their pre-release
state.

## Root cause

`readCommitRange` (`packages/linear/src/cli-sync.js`) resolves the range and
hands it to `git log`, trusting the result:

```js
const raw = git(['log', '--format=%H%x00%s%x00%b%x1e', range])
if (raw === null) { /* refuse */ }
```

`git log` returns `null` here only when it **exits non-zero**. On a truncated
history it exits **zero** with a short list, so the refusal never fires. Nothing
asks whether the range's base is actually reachable in this clone.

The default-range path is safe by accident: `git describe --tags --abbrev=0`
fails (exit 128) when no tag is in the truncated history, and that failure is
reported. Only the **explicit** range undercounts — which is the path
`ci-stages.md` tells people to use in CI.

## Failing test (red)

`packages/linear/test/cli-shallow-range.test.js` — builds a real origin, clones
it at `--depth 2`, fetches tags, and runs the real CLI.

```
$ node --test packages/linear/test/cli-shallow-range.test.js

x released refuses rather than undercount when the base is outside a shallow history
  AssertionError: must not report a partial range as a clean run
  0 !== 1
x stage refuses too — it would move only the tickets it happened to see
```

Three tests in the same file **pass before the fix and must keep passing**: the
full-clone truth, a `--depth 6` clone (still shallow, but complete for this
range), and a `--depth 100` clone.

## Fix

- [x] Verify the base is genuinely in this history before trusting the range:
      `git merge-base --is-ancestor <base> <head>`. Non-zero → refuse, naming the
      base and the shallow cause, with the `fetch-depth: 0` remedy.
- [x] Parse the range as `<base>..<head>` (two dots, not three); a range that is
      not that shape has no base to check, so it falls back to a
      shallow-repository warning rather than a refusal.
- [x] Failing tests now pass (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [x] Cross-reference the guard from `ci-stages.md`, which currently documents
      the `fetch-depth` requirement as prose with nothing enforcing it.

**Rejected:** refusing whenever `git rev-parse --is-shallow-repository` is true.
A shallow clone deep enough to contain the base has a **complete** range and is
perfectly healthy — verified at `--depth 6`, where the repo reports `true` and
the range is correct. That check would accuse a healthy input, which is what the
stays-silent test in this file exists to prevent.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync released` — refuse an unreachable base |
| CLI command | update | `spec-sync stage` — same, before any write |
| Docs | update | `ci-stages.md` — point at the guard |

No change to the trailer parser, the ladder, or any Linear write path. The
refusal is additive: a complete range behaves exactly as before.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Fixed: `readCommitRange` now checks
  `git merge-base --is-ancestor <base> <head>` before trusting `git log`, and
  refuses an unreachable base naming the shallow cause. Tests green (1199/1199).
  The guard lives in `unreachableBase`, which deliberately declines to judge a
  range it cannot parse as `A..B` — a guard that cannot see the shape must not
  pretend it checked.
- 2026-09-04 — Bug reproduced against a real shallow clone; failing test added
  (red). Found while reviewing whether skittership needed seams: its
  `git-commits.cjs` runs `git fetch --tags --force` for exactly this reason,
  which prompted checking our own range handling.
