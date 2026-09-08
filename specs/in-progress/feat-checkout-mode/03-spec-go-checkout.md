---
linear_issue_id: "SKS-80"
---

# Phase 3 — `/spec-go` provisions in place ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** in `checkout` mode, `/spec-go <name>` creates the branch in the primary
checkout and builds the phase there — no worktree, no hand-off, and the
operator's existing Warp window shows the right diffs throughout.

## Tasks

- [ ] Teach `spec-env up` a checkout-mode plan: create the spec's branch in the
      primary checkout (`git switch -c <branch>`), report the branch and the
      checkout path, and emit **no** `git worktree add`, no bootstrap block and no
      opener. Re-running on an existing branch re-attaches by switching to it.
- [ ] Require a clean tree before switching, and refuse with the reason when it
      is dirty — `git switch -c` would otherwise carry uncommitted work onto the
      new branch.
- [ ] Refuse when the checkout is already on **another spec's** branch, naming
      it and pointing at committing or completing that spec first (Decision 7).
      Being on the target spec's own branch is a re-attach, not a refusal.
- [ ] Amend `packages/common/assets/skills/spec-go/SKILL.md` so the provisioning
      section branches on the mode: worktree keeps the hand-off (now with the
      Phase 1 opener), checkout runs the plan above and carries **straight on**
      to the spec move, the header edits and the build in the same session.
- [ ] Keep the live check ahead of both paths — in checkout mode `live: yes` is
      impossible by construction, so state that rather than leaving a check that
      can never fire.
- [ ] Rebuild dists (`pnpm build`).
- [ ] Add/extend tests covering this phase: the checkout-mode plan emits a branch
      switch and no worktree/bootstrap/opener commands; the dirty-tree and
      wrong-branch refusals fire; a **stays-silent** case proving worktree mode's
      plan is byte-identical to today's. Assert `spec-go`'s asset documents both
      paths. Run `pnpm test` — green before the phase is done.
