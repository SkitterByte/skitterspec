---
linear_identifier: "SKS-126"
linear_url: "https://linear.app/skitterbyte/issue/SKS-126/bug-spec-env-reads-the-spec-file-from-the-primary-checkout-not-the"
---

# Bug: `spec-env` reads the spec file from the primary checkout, not the worktree

> **Type:** Bug
> **Name:** bug-spec-env-reads-main-spec (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-09
> **Area:** packages/common/src/env/resolve.js, packages/common/src/cli.js, packages/common/test

## Symptom

Run from inside a spec's worktree, `spec-env resolve` reports the spec's bucket
from `main` rather than from the branch you are standing on:

```
$ pwd
/Users/reubengreaves/code/skitterspec-wt/linear-spec-list
$ ls specs/in-progress/
feat-linear-spec-list                      ← in-progress here

$ skitterspec spec-env resolve feat-linear-spec-list
spec:       feat-linear-spec-list (backlog)   ← but it reports backlog
worktree:   /Users/reubengreaves/code/skitterspec-wt/linear-spec-list
branch:     feat/linear-spec-list
```

`/spec-start` moves a spec to `specs/in-progress/` **on that spec's own branch**,
so the primary checkout still has it under `backlog` — and that is the answer
`spec-env` gives, from anywhere, for the whole life of the spec.

The bucket is the visible half, and on its own it is only a status field that
lies. The same lookup also supplies two fields that **change behaviour**:

- **`Stack:`** — escalating a spec to `worktree + docker` is documented as
  "edit the header, or run `spec-env up <name>`". The edit happens in the
  worktree, where the work is; `up` then reads `main`'s copy, still sees
  `worktree`, and brings up **no Docker stack**.
- **`Base version:`** — a hotfix's fork point, read from the same stale file.

## Root cause

`packages/common/src/cli.js:1818` anchors `dir` on the primary checkout for the
whole `spec-env` dispatch — correct, and deliberately so: it is
`bug-spec-env-cwd-anchor`'s fix, which exists because `{repo}`, the worktree
path, the registry and the docker project name are repo-level facts that must
resolve identically from anywhere.

But the same anchored `dir` is then used to find the spec **folder**.
`resolveSpecWithWorktree` (`packages/common/src/cli.js:912`) does put the spec's
own worktree in `searchDirs` — and `findSpecFolder`
(`packages/common/src/env/resolve.js:26`) searches `dir` **first**, so the
primary checkout always wins. `resolveSpec` then reads `bucket` from that hit,
and `readStackField` / `readBaseVersionField` read `00-overview.md` from the same
path (`resolve.js:236-238`).

One anchor was answering two different questions. Repo identity is a property of
the repo; a spec's bucket and headers are properties of the **branch**.

Ownership classification is unaffected: `classifyDirtyTree`
(`packages/common/src/env/classify.js:74`) deliberately checks *all* buckets, so
the `spec-env up` gate never depended on `spec.bucket` being right.

## Failing test (red)

- `packages/common/test/env-resolve-prefers-worktree.test.js` — 7 unit tests on
  `resolveSpec`'s search order. **4 red** before the fix (bucket, `Stack:`,
  `Base version:`, prefer-before-fallback); 3 green throughout — they are the
  guards, and a guard that only passes after the fix is guarding nothing.
- `packages/common/test/cli-spec-env-resolve-bucket.test.js` — 4 live-git tests
  driving the real CLI over a repo whose spec is `backlog` on `main` and
  `in-progress` on its branch. Verified red by disabling the one-line wiring:

```
✖ resolve reports the bucket from the spec's worktree, run from the primary checkout
✖ and the same answer when run from inside the worktree
✔ repo identity still comes from the primary checkout, not the worktree
✔ a spec with no worktree still reports its primary-checkout bucket
```

Run: `pnpm test` in `packages/common`, or `node --test test/<file>`.

## Fix

- [x] `findSpecFolder` gains a `preferDirs` list searched **before** `dir`, with
      the blind spot named beside it (`resolve.js:21-37`).
- [x] `resolveSpec` accepts `opts.preferDirs` and includes them in the
      not-found message; identity tokens keep expanding against `dir` only.
- [x] `resolveSpecWithWorktree` promotes **this spec's own worktree** from a
      fallback to a preferred root — and only that one, never the other
      `searchDirs`, which are other specs' checkouts.
- [x] Failing tests now pass (GREEN); full repo suite green — **1628 pass, 0
      fail**. (This repo has no separate typecheck step.)
- [x] Nothing outstanding.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env resolve` reports the branch's bucket, not `main`'s |
| CLI command | update | `spec-env up` sees a `Stack:` escalated in the worktree, so Docker actually comes up |
| Domain object | update | `resolveSpec(..., { preferDirs })`; `findSpecFolder(..., preferDirs)` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | In Progress | in-progress | Reuben Greaves |
| 2026-09-09 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-09 — Bug reproduced; failing tests added (red), at both the unit and
  live-git CLI levels.
- 2026-09-09 — Found while writing `feat-spec-start-opens-tab`: `resolve` said
  `backlog` for a spec that was `in-progress` in the worktree it was run from.
  Investigation widened it — the bucket is cosmetic, but `Stack:` and
  `Base version:` come from the same stale file and change what gets provisioned.
- 2026-09-09 — Fixed: the spec's own worktree is preferred over the primary
  checkout for the spec **file** only. `bug-spec-env-cwd-anchor`'s identity
  anchor is untouched, and a test pins that it stays that way.
- 2026-09-09 — Completed; all fix tasks done, tests green (1628 pass, 0 fail).
  Nothing deferred.
