---
linear_issue_id: "SKS-91"
---

# Phase 5 — Complete from a worktree session ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-complete` and `/spec-cancel` run inside a manual worktree tab
(the parallel path) land and tear down without sawing off the directory they
sit in.

## Tasks

- [x] Verify empirically: from inside a worktree, does `git worktree remove
      <own path>` refuse, and does the `git -C <primary>` anchored form succeed
      while the calling shell's cwd is inside the removed tree? Record the
      observed behaviour in Notes; the tasks below assume the anchored form
      works, and defer teardown to a printed from-the-primary command if not.
- [x] Amend both skills' teardown: when the session is inside the spec's own
      worktree, relocate the agent's cwd to the primary checkout first, then
      run the `-C`-anchored commands. Pin the ordering in the skill text.
- [x] The closing report in that case: the working directory no longer exists;
      the landed work is on base in the primary checkout; this tab's shell is
      the operator's own to close.
- [x] Add/extend tests: relocate-before-teardown ordering present in both
      skills; a stays-silent case proving a completion run from the primary
      (the live flow) is unchanged; run `pnpm build` + `pnpm test` — green
      before the phase is done.

## Notes

**The empirical check overturned the phase's own premise.** It asked whether
`git worktree remove <own path>` *refuses* from inside the tree. It does not —
both the bare and the `git -C <primary>`-anchored forms **succeed**, exit 0, and
remove the worktree.

The hazard is the opposite shape and worse for it: the removal succeeds, the
directory vanishes under the shell, `pwd` still reports the dead path, and every
subsequent command fails with `fatal: Unable to read current working directory`.
So teardown looks clean and everything *after* it breaks — the closing report,
the prune, any verification. Anchoring the command was never the fix; relocating
the session first is, and the ordering is what the tests pin.
