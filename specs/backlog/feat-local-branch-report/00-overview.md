---
github_identifier: "#262"
github_url: "https://github.com/SkitterByte/skitterspec/issues/262"
---

# Report branches that still carry the install

> **Type:** Feature
> **Name:** feat-local-branch-report
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/262
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** packages/common/src/init.js, packages/common/src/env/resolve.js, packages/common/test/init-local.test.js, docs
> **Stack:** worktree
> **Docs:** index, reference

## Summary

After `init --local` converts a committed install, and on every later
`update` in a local install, skitterspec lists each long-lived branch
(the base, the hotfix release branch and the remote's default branch) that
still has skitterspec's managed files committed. Teammates working from one
of those branches keep getting the skills, and the report says so.

## Problem

`init --local` converts only the branch it runs on. In LSC the conversion
was committed on `2026/Q4`, but `master` still committed 42 managed files and
the hook entries in `settings.json`. Anyone working from `master`, a hotfix
branch included, still had the whole workflow loaded by Claude Code without
installing anything. Nothing told the operator, and the conversion looked
finished. The config already names those branches (`baseBranchPattern`,
`hotfix.releaseBranch`), and their remote copies can be read without fetching.

## Acceptance criteria

- `init --local` converting a committed install, in a repo whose
  `origin/master` still tracks managed files, prints one line naming
  `origin/master` and its count of managed files, plus the fix.
- `update` in a local install prints the same line for as long as the branch
  still tracks those files, and nothing once it does not.
- A branch checked only as the current branch, a feature branch, or a repo
  with no remote prints nothing.
- A branch that cannot be read prints `cannot tell`, never "clean".
- A team (non-local) install prints nothing new.

## Decisions

1. **Long-lived branches only.** Checked: the resolved base (under
   `baseBranchPattern`, only the newest match), `hotfix.releaseBranch`, and
   the remote's default branch
   (`refs/remotes/origin/HEAD`), deduplicated and excluding the branch being
   converted. Feature branches catch up when they merge the base, and listing
   every colleague's branch is noise. Rejected: every local and
   remote-tracking branch.
2. **Local and remote-tracking copies, never a fetch.** `git ls-tree` on
   `<name>` and `origin/<name>`, whichever exist. The report says it read the
   refs as of the last fetch. Fetching would make `init` and `update` hit the
   network.
3. **Runs at conversion and on every local-scope `update`.** It keeps
   reminding until the long-lived branches are clean, which is what would
   have caught `master` after the LSC conversion was committed and
   forgotten. Rejected: conversion only, because one line at the end of a
   run is easy to miss.
4. **Report, never act.** It goes in `report.suggestions` (or `warnings` for
   cannot-tell). It never checks out, commits or pushes another branch.
5. **The managed set is the manifest's own list**, matched against
   `ls-tree` at the git-root prefix (Decision 11 of `feat-local-install`),
   plus our hook entries in that branch's `.claude/settings.json`. A
   teammate's own `.claude/skills/foo` is never counted.
6. **Cannot tell is its own answer.** A ref that exists but whose tree cannot
   be read, or a base that does not resolve (a gap between release branches),
   gets a `cannot tell` line, or no line for the unresolved base. It never
   becomes "clean" (`.claude/rules/negative-checks.md`).

## Solution overview

A pure `branchesCarryingInstall(dir, managedPaths, git)` in `init.js`:

1. Collect candidate names from `describeBaseBranch` (when it resolves),
   `hotfix.releaseBranch`, and `origin/HEAD`, minus the current branch.
2. For each, `ls-tree -r --name-only` on the local and remote-tracking refs
   that exist, intersect with the managed paths, and check that ref's
   `settings.json` for our hook commands.
3. Return `{ ref, files, hooks }` rows, or `{ ref, cannotTell }`.

`convertCommitted` and the local-scope path of `resync` call it and push one
line per row:

```
origin/master still commits the install (42 managed files, 7 hooks) — as of
the last fetch. Teammates on it still get the skills: merge this conversion
into it, or run `skitterspec init --local` there and commit.
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `init --local` reports long-lived branches still carrying the install |
| CLI command | update | `update` in a local install repeats that report |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Branch report at conversion and update | ⬜ | [01-branch-report.md](01-branch-report.md) |
| 2 | Docs | ⬜ | [02-docs.md](02-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-19 — Spec created, from LSC: `master` kept 42 managed files after
  the `2026/Q4` conversion, and colleagues working from it still got the
  skills.
