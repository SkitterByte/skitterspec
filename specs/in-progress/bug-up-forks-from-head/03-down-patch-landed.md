---
github_issue_id: "#322"
---

# Phase 3 — down treats a cherry-picked re-land as landed ✅

> **Status:** Done

**Goal:** after a re-land by cherry-pick, `spec-env down` needs no `--force`
when nothing on the branch would be lost.

## Tasks

- [x] RED — `cli-spec-env-down-carried.test.js`: feat/next carries feat/live's
      commit plus its own; its own is cherry-picked onto main; feat/live still
      holds the other. `down feat-next` without `--force` plans the teardown
      (`git branch -D`), not the "unpushed commits" refusal.
- [x] `worktreeGitState`: new `carried` signal (`carriedElsewhere`), true when
      every commit in `git cherry <base> HEAD` is `-` (patch-equivalent on the
      base) or contained in another local branch. It joins `merged` and
      `reachableFromTag` in `planDown`'s `landed`, which also decides `-D`.
      It is deliberately left out of the epic's landed-member memory: a commit
      held by another branch is safe, not landed.
- [x] Cannot-tell (`git cherry` or `for-each-ref` fails, an empty answer) is
      not carried, so the guard stays as it was.
- [x] Stays-silent tests: the spec's own commit held nowhere else still
      refuses; the other spec's branch deleted, so its commit is held nowhere
      else, still refuses.
- [x] `docs/reference.html` `spec-env down` row; `verify reference`.
- [x] GREEN — `pnpm test`: 4619 passed, 0 failed.
