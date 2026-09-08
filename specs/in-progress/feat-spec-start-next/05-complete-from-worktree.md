---
linear_issue_id: "SKS-91"
---

# Phase 5 — Complete from a worktree session ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-complete` and `/spec-cancel` run inside a manual worktree tab
(the parallel path) land and tear down without sawing off the directory they
sit in.

## Tasks

- [ ] Verify empirically: from inside a worktree, does `git worktree remove
      <own path>` refuse, and does the `git -C <primary>` anchored form succeed
      while the calling shell's cwd is inside the removed tree? Record the
      observed behaviour in Notes; the tasks below assume the anchored form
      works, and defer teardown to a printed from-the-primary command if not.
- [ ] Amend both skills' teardown: when the session is inside the spec's own
      worktree, relocate the agent's cwd to the primary checkout first, then
      run the `-C`-anchored commands. Pin the ordering in the skill text.
- [ ] The closing report in that case: the working directory no longer exists;
      the landed work is on base in the primary checkout; this tab's shell is
      the operator's own to close.
- [ ] Add/extend tests: relocate-before-teardown ordering present in both
      skills; a stays-silent case proving a completion run from the primary
      (the live flow) is unchanged; run `pnpm build` + `pnpm test` — green
      before the phase is done.
