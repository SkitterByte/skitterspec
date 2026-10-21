---
linear_issue_id: "SKS-405"
---

# Phase 4 — Carry to main without the version commit ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** main gains the fix and the spec's completion commits, and never the version
commit.

## Tasks

- [x] Carry set: `rev-list --reverse baseRef..branch`, minus the recorded `versionCommit`,
  minus every commit `git cherry <main> <branch>` marks `-`. An empty set is a reported
  no-op.
- [x] Landing strategy:
  - main checked out and clean → cherry-pick in place;
  - main not checked out → a throwaway worktree, removed afterwards;
  - main checked out and dirty → refuse, printing the manual command.
- [x] On a conflict: `cherry-pick --abort`, name the commit, and leave the hotfix branch
  and the record untouched, so a re-run retries the carry.
- [x] Afterwards run `afterLand` in the primary checkout, as today, only when main gained
  commits.
- [x] Keep `hotfix.cherryPickMain: false` meaning no carry.
- [x] Extra targets cherry-pick the same carry set, not `baseRef..branch`. Today they still
  pick the whole range, version commit included.
- [x] Tests:
  - the version commit is excluded;
  - `git cherry` duplicates are excluded;
  - the spec-doc commits are kept;
  - an empty carry is a no-op;
  - each of the three strategies;
  - a conflict aborts cleanly.
- [x] Run `pnpm test`; green before the phase is done.
