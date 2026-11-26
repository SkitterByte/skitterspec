---
github_issue_id: "#322"
---

# Phase 3 — down treats a cherry-picked re-land as landed ⬜

**Goal:** after a re-land by cherry-pick, `spec-env down` needs no `--force`
when nothing on the branch would be lost.

## Tasks

- [ ] RED — real repo: B carries A's commit plus its own; B's own commit is
      cherry-picked onto main; A's branch still holds A's commit. `down B`
      without `--force` plans the teardown, not the "unpushed commits" refusal.
- [ ] `worktreeGitState`: a new `carried` signal, true when every commit in
      `git cherry <base> HEAD` is either `-` (patch-equivalent on the base) or
      contained in another local branch. It joins `merged` and
      `reachableFromTag` in `planDown`'s `landed`, which also decides `-D`.
- [ ] Cannot-tell (`git cherry` fails, an empty answer) is not carried, so the
      guard stays as it was.
- [ ] Stays-silent test: one genuinely unlanded commit, held by no other
      branch, still refuses.
- [ ] GREEN — `pnpm test`.
