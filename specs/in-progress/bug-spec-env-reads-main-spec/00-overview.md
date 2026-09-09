# Bug: `spec-env` reads the spec file from the primary checkout, not the worktree

> **Type:** Bug
> **Name:** bug-spec-env-reads-main-spec (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
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
`spec-env` gives, from anywhere.

The bucket is the visible half. The same lookup also supplies `Stack:` and
`Base version:`, which are read from the same primary-checkout file.
