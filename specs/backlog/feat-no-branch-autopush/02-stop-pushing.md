---
linear_issue_id: "SKS-164"
---

# Phase 2 — `/spec-start` stops pushing the branch ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** provisioning a spec creates a branch and a worktree locally and
publishes nothing; the commit stays, the push goes.

## Tasks

- [ ] In `packages/common/assets/skills/spec-start/SKILL.md` step 4, change
      "Commit it, and push the branch" to commit only, and drop the "records the
      in-progress state for everyone and fires the tracker's automation" clause —
      the automation half is false unless `branch.pattern` carries
      `{identifier}` (see `env.config.md`).
- [ ] Say whose job publishing is, and give the command, so the removal reads as
      a decision rather than an omission.
- [ ] Note that the teardown guard is now reachable at `/spec-cancel`, and point
      at phase 1's path rather than re-explaining it.
- [ ] Confirm no other lifecycle skill pushes a branch — `/spec-bug` never did
      and `/spec-hotfix` forbids it, so this makes the three consistent.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

**The guard test is the invariant, not a nicety.** Decision 1 is absolute — no
lifecycle skill publishes a spec branch at any point — so assert exactly that:
no shipped lifecycle skill instructs a `git push` of a spec branch. Assert it
across the composed surfaces, not just the source, and word it so the legitimate
pushes stay legal —
`/spec-hotfix`'s deploy **tag**, `/spec-complete`'s advice that the user may push
the **base branch**, and teardown's `push --delete`. A blanket ban on the string
`git push` would fail on all three, which is how a guard like this gets deleted
rather than fixed.

The engine needs no change at all: `spec-env up` never pushed. This is entirely
prose, which is why it is small — and why the guard tests matter more than usual.

The test is also what stops the rule eroding later. "Just push it after phase 1,
as a backup" is the reasonable-sounding change that reintroduces this, and a
guard that names the invariant is the only thing that will be in the way.
