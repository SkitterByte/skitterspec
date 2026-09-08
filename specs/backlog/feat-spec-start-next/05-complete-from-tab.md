---
linear_issue_id: "SKS-91"
---

# Phase 5 — Complete from the tab ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-complete` (and `/spec-cancel`) run inside a hand-off tab land
and tear down without sawing off the branch they sit on, and end by making the
tab's own close the natural last step.

## Tasks

- [ ] Verify the failure this phase exists for: from inside a worktree, does
      `git worktree remove <own path>` refuse, and does anchoring it as
      `git -C <primary> worktree remove <path>` succeed while the calling
      shell's cwd is inside the removed tree? Record the observed behaviour in
      this file's Notes — the remaining tasks assume the anchored form works;
      if it does not, teardown from a tab defers to a printed
      "run `spec-env down <name>` from the primary checkout" and the tasks
      below adjust to that.
- [ ] Amend `/spec-complete` step 7 (and `/spec-cancel`'s teardown): when the
      session is inside the spec's own worktree, **relocate the agent's cwd to
      the primary checkout before executing the teardown commands**, and run
      them in the `git -C <primary>` anchored form. The landing itself needs no
      change — its commands are already `-C`-anchored on both repos.
- [ ] After teardown in a tab session, the report must say the session's job is
      over and how the tab closes: the working directory no longer exists, the
      landed work is on base in the **primary checkout**, and quitting Claude
      (`/exit`) closes the tab (the tab-config command chain ends with `exit`,
      Phase 3). Never claim the tab was closed — nothing can close it from
      outside.
- [ ] Guard the stranded state: any Bash step after the worktree's removal must
      not assume the old cwd exists (a deleted cwd fails every relative
      command). The relocate-first rule above is the fix; add a test-visible
      note in the skill text so a future edit does not reorder it.
- [ ] Add/extend tests: the skill text orders relocate-before-teardown and
      names the `/exit` close; `/spec-cancel` carries the same passage; a
      stays-silent case proving a completion run from the primary checkout
      (today's live-mode flow) is unchanged. Run `pnpm build` + `pnpm test` —
      green before the phase is done.
