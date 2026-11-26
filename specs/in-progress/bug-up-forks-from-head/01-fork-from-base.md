---
github_issue_id: "#320"
---

# Phase 1 — Fork from the base, named ✅

**Goal:** every fresh `git worktree add -b` that `up` or `nospec` prints names
the resolved base as its start point, so a spec live in the primary checkout
can never be inherited.

## Tasks

- [x] RED — `cli-spec-env-up-live-fork.test.js`: live spec A on the primary,
      `up` B / `up --docs` / `nospec`; run the printed command; B's merge-base
      with main is main's tip and `main..B` is empty.
- [x] `baseForkRef(config, git, base)` in `cli.js`: the local base branch, else
      `<remote>/<base>`, else null (cannot tell, so the fork is left to HEAD as
      before and git is never handed a start point it would refuse).
- [x] `up`: set `spec.forkFrom` from it for every non-hotfix spec, not only
      under `baseBranchPattern`. `forkMoved` (base ≠ what is checked out) now
      drives the `fork:` line and the "uncommitted on X, but the base is Y"
      refusal, which used to key off `forkFrom` being set at all.
- [x] `nospec`: same start point on its printed `-b`.
- [x] Hotfix keeps its tag (`baseRef` outranks it); a resumed branch keeps
      `--track`; an attach keeps no `-b`.
- [x] Update the six tests that pinned the bare `-b`. One of them, "no pattern
      → forks from the checkout", pinned the bug itself and now asserts the
      `fork: main` line.
- [x] `docs/reference.html` `spec-env up` row; `verify reference index`.
- [x] GREEN — `pnpm test`: 4610 passed, 0 failed.
