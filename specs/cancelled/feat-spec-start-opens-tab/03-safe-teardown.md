---
linear_issue_id: "SKS-124"
---

# Phase 3 — teardown never deletes the caller's own worktree ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-complete` lands the branch and then declines to remove the
worktree the caller is standing in, telling them to close the tab; `spec-env
prune` reaps it afterwards — proven by tests that run teardown from inside the
target worktree.

## Tasks

- [ ] In `packages/common/src/env/teardown.js`, add a **standing-in check**
      alongside the existing `refuseTeardownIfDirty` / `refuseTeardownIfUnpushed`
      guards: when the caller's cwd is inside the worktree being removed, skip the
      removal and report it as deferred.
- [ ] Compare paths by **resolved real path**, not lexically — `path.resolve`
      gives `/tmp/...` where the OS reports `/private/tmp/...` on macOS, and a
      string compare would miss the very case this guard exists for. Also treat
      any cwd *below* the worktree root as inside it.
- [ ] Make it a **deferral, not a refusal**: the branch is still landed, the spec
      is still moved to `complete`, and only the directory removal is postponed.
      Exit 0. Print what is left behind, and name `spec-env prune` as what reaps
      it.
- [ ] Confirm `spec-env prune` already removes a worktree in this state, and
      extend it if it does not — the deferral is only safe if something later
      collects it.
- [ ] Update `spec-complete/SKILL.md` to relay the deferral and end with
      "close this tab" when it fires. Say nothing extra when it does not — a spec
      completed from the primary checkout is unaffected and must not gain a new
      instruction it does not need.
- [ ] Apply the same treatment to `/spec-cancel`, which shares the teardown path.
- [ ] Add `packages/common/test/env-teardown-standing-in.test.js` covering:
      teardown from **inside** the worktree defers and exits 0 with the branch
      still landed; teardown from the primary checkout removes as it does today
      (the stays-silent test — the guard must not fire on the ordinary case);
      a symlinked temp path (`/tmp` vs `/private/tmp`) still matches; and `prune`
      subsequently removes the deferred worktree.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

This guard matters more under the new flow than the old one: with `EnterWorktree`
no shell was ever inside the worktree, so deleting it stranded nothing. With the
opener, both the shell **and** Claude are in there, and a deleted cwd fails
confusingly rather than cleanly.

`.claude/rules/negative-checks.md` applies directly — this check acts on what it
concludes (it withholds a deletion), so it needs the blind spot named beside it
(symlinked paths; a cwd that is the worktree's parent rather than the worktree)
and a stays-silent test proving it does not fire on an ordinary teardown.
