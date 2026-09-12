# Bug: the fork-point check looks outside the repo and calls it missing

> **Type:** Bug
> **Name:** bug-fork-check-worktree-path (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-12
> **Area:** packages/common/src/cli.js, packages/common/src/env/provision.js, packages/common/test

## Symptom

Running `spec-env up` for a spec that already has a worktree refuses with a claim
that is simply false:

```
$ skitterspec spec-env up feat-selfhost-link-integrity
spec-env up: blocked — feat-selfhost-link-integrity is not committed in main
  — the worktree would fork without the spec it is for
```

The spec **is** committed in `main`, in `specs/backlog/`. The refusal sends you
looking for an uncommitted file that does not exist, and it also drops the
`— it is on <branch>` hint the message is supposed to carry.

`/spec-complete` documents `skitterspec spec-env up <name>` as the way to
re-attach a worktree after `--keep-env`, so this blocks a documented path.
