---
linear_identifier: "SKS-176"
linear_url: "https://linear.app/skitterbyte/issue/SKS-176/bug-the-fork-point-check-looks-outside-the-repo-and-calls-it-missing"
---

# Bug: the fork-point check looks outside the repo and calls it missing

> **Type:** Bug
> **Name:** bug-fork-check-worktree-path (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-12
> **Area:** packages/common/src/cli.js, packages/common/test/cli-spec-env-up.test.js

## Symptom

Running `spec-env up` for a spec that already has a worktree refuses with a claim
that is simply false:

```
$ skitterspec spec-env up feat-selfhost-link-integrity
spec-env up: blocked — feat-selfhost-link-integrity is not committed in main
  — the worktree would fork without the spec it is for
```

The spec **is** committed in `main`, in `specs/backlog/`. Two harms: the refusal
sends you looking for an uncommitted file that does not exist, and the message
also loses its `— it is on <branch>` half, which is the part that would have made
it actionable.

`/spec-complete` documents `skitterspec spec-env up <name>` as the way to
re-attach a worktree after `--keep-env`, so this blocks a documented path.

## Root cause

`specOnForkPoint` (`packages/common/src/cli.js:340`) asked git about
`path.relative(dir, spec.path)`. `spec-env up` resolves a spec with the worktree
**preferred** over the primary checkout, so for any in-flight spec `spec.path`
points into the worktree — and the relative path escapes the repo entirely:

```
rel : ../skitterspec-wt/selfhost-link-integrity/specs/in-progress/feat-selfhost-link-integrity
```

No `cat-file` and no `log` can ever match that, so `onFork` came back `false` and
`foundOn` came back `null` — one lookup producing both halves of the wrong
answer. Underneath that is a question asked wrongly: it looked for the spec at
**one bucket path**, when which bucket holds a spec is a property of the ref you
are asking about. `/spec-start` moves a spec to `in-progress` on its own branch
while the base branch still shows `backlog`; the two disagreeing is the model
working, not a fault.

Textbook `.claude/rules/negative-checks.md`: an absence treated as evidence when
the lookup could never have seen the thing.

## Failing test (red)

`packages/common/test/cli-spec-env-up.test.js` — two cases, both driving the real
CLI against a real git fixture where the spec is committed on `main` in
`specs/backlog/` and moved to `specs/in-progress/` on its branch:

- **`re-attaching an in-flight spec does not accuse the repo of losing it`** —
  red with
  `spec-env up: blocked — feat-y is not committed in main — the worktree would fork without the spec it is for.`
- **`a spec genuinely absent from the fork point is still refused`** — the
  guard's own case (a spec authored on the branch and never committed to base).
  It refused correctly but silently dropped `it is on feat/q`, which is the same
  bug's other half.

Run: `node --test packages/common/test/cli-spec-env-up.test.js`

## Fix

- [x] Ask by **folder name across every bucket** (`BUCKETS.map(b => specs/${b}/${folder})`)
      rather than by `spec.path`, for both the `cat-file` existence check and the
      `log` that names the branch. Repo-relative by construction, so no path can
      escape the repo again.
- [x] Failing tests now pass (GREEN); both suites green with no regressions —
      `packages/common` 733, root 1858.
- [x] Keep the guard firing on its real case, proved by the second test rather
      than assumed — a fix that deleted the accusation instead of correcting it
      would pass the first test alone.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env up` re-attaches an in-flight spec instead of refusing |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-12 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-12 — Bug reproduced; failing test added (red), then fixed. The second
  test is the load-bearing one: it pins that the guard still refuses a spec
  genuinely absent from the fork point, and it caught that the `it is on <branch>`
  hint had been silently empty for the same reason.
