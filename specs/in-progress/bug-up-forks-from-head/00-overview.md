---
github_identifier: "#319"
github_url: "https://github.com/SkitterByte/skitterspec/issues/319"
---

# Bug: up forks a new spec from HEAD, so a live spec's commits land under its name

> **Type:** Bug
> **Name:** bug-up-forks-from-head (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/319
> **Area:** packages/common/src/cli.js (`up`, `nospec`, `integrate`, `down`), packages/common/src/env/teardown.js
> **Severity:** 2 - High
> **Stack:** worktree
> **Docs:** reference

## Symptom

Reported from a real run in ereqs (skitterspec 23.24.5, `mode: worktree`,
`land.strategy: ff`, `/spec-live` in use), 2026-11-26:

> 1. feat-publish-batch-health was live: /spec-live had switched the primary
>    checkout ~/code/ereqs to feat/publish-batch-health.
> 2. /spec-bug ran `skitterspec spec-env up bug-boards-release-spec-only-refs
>    --docs` from the primary checkout. It printed
>    `git worktree add …/boards-release-spec-only-refs -b bug/boards-release-spec-only-refs`.
>    No start point, so git used HEAD, which was the live spec's branch.
> 3. The bug was fixed with 2 commits. […] integrate planned the usual
>    rebase main and merge --ff-only. The rebase was a no-op, and the
>    fast-forward moved main by 8 commits: the bug's 2 plus
>    feat-publish-batch-health's 6.
> 4. integrate's after-land plan then asked for build:element because
>    src/types/process-release.schema.ts changed. That file was in the other
>    spec's commits, not the bug's. That was the only visible sign.
> 5. Fixed by hand: git reset --hard of main, then cherry-picks of the 2 bug
>    commits. spec-env down then refuses with "unpushed commits not yet merged
>    into the base branch" and needs --force, although git cherry shows every
>    commit is on main or on feat/publish-batch-health.

Unreviewed, unfinished work from one spec lands on main under another spec's
name. Nothing warns and every step reports success. It has recurred.

## Root cause

`spec-env up` (`cli.js`, the fork block before `planUp`) set a start point
(`spec.forkFrom`) **only under `baseBranchPattern`**, and `planUp`
(`env/provision.js:376`) appends one only when `forkFrom` or a hotfix's
`baseRef` is set. Everywhere else the printed `git worktree add <path> -b
<branch>` had no start point, so git forked from the primary checkout's HEAD.
`/spec-live` puts a spec's branch there on purpose. `spec-env nospec` printed
the same bare `-b`. `integrate` then checks nothing about what the branch
carries beyond being ahead of the base, and `down`'s landed test is ancestry
only (`worktreeGitState`, `merge-base --is-ancestor`), which a re-land by
cherry-pick can never satisfy.

## Failing test (red)

`packages/common/test/cli-spec-env-up-live-fork.test.js`: a real repo with spec
A's branch `feat/live` (2 commits) checked out in the primary checkout. It runs
`up feat-next`, `up bug-found-meanwhile --docs` and `nospec bump-deps`, **runs the
printed `git worktree add`**, and asserts that the command ends `-b <branch>
main`, that `merge-base main <branch>` is main's tip, and that `main..<branch>`
is empty. A fourth case, with the primary on main, asserts the start point is
still named and no `fork:` line prints.

`node --test packages/common/test/cli-spec-env-up-live-fork.test.js`, red before
the fix:

```
actual: [ '…/skitterspec-livefork-qOpRIL-wt/next', '-b', 'feat/next' ],
expected: [ '-b', 'feat/next', 'main' ],
```

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Fork from the base, named](01-fork-from-base.md) | ✅ Done |
| 2 | [integrate names another spec's commits](02-integrate-foreign-commits.md) | ✅ Done |
| 3 | [down treats a cherry-picked re-land as landed](03-down-patch-landed.md) | ⬜ |

Phase 1 is the root cause and ships the fix on its own. Phases 2 and 3 are
the hardening the report's acceptance criteria ask for. Phase 2 catches a branch
that is already contaminated, from before the fix or from a hand-made fork.
Phase 3 removes the `--force` the manual recovery needed.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env up`: every fresh `-b` names the base (local, else `<remote>/<base>`); `fork:` prints whenever the primary checkout is not on it |
| CLI command | update | `spec-env nospec`: the printed `-b` names the base |
| CLI command | update | `spec-env integrate`: refuses a branch created on commits not on the base, naming them and their owner; `warning:` for another ticket's `Refs:` or another spec's folder |
| CLI command | update | `spec-env down`: patch-equivalent or elsewhere-held commits count as landed (phase 3) |

## Changelog

- 2026-11-26 — Bug reproduced; failing test added (red).
- 2026-11-26 — Phased: the report's acceptance criteria cover three surfaces
  (fork, land, teardown). The fork is the root cause and phase 1; the other
  two are hardening.
- 2026-11-26 — Fixed phase 1: `up` and `nospec` name the base as the start
  point whatever is checked out; test green, suite green (4610 passed).
  Checkout mode (`git switch -c`) is out of scope: it builds one spec at a time
  in the primary checkout, so no other spec can be live there.
- 2026-11-26 — Phase 2 deviates from its plan. Reachability from another spec's
  branch cannot say who owns a shared commit: a branch forked FROM this one
  shares commits just the same. So the refusal keys on the branch's creation
  point (oldest reflog entry), which is a positive, directional signal.
  `Refs:` and spec-folder matches only warn, because commit-trailers.md
  allows one spec's commits on another's branch on purpose. The PR-mode land
  is left as it was: the host's PR shows the carried commits for review.
