---
linear_issue_id: "SKS-164"
---

# Phase 2 — `/spec-start` stops pushing the branch ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** provisioning a spec creates a branch and a worktree locally and
publishes nothing; the commit stays, the push goes.

## Tasks

- [x] In `packages/common/assets/skills/spec-start/SKILL.md` step 4, change
      "Commit it, and push the branch" to commit only, and drop the "records the
      in-progress state for everyone and fires the tracker's automation" clause —
      the automation half is false unless `branch.pattern` carries
      `{identifier}` (see `env.config.md`).
- [x] Say whose job publishing is, and give the command, so the removal reads as
      a decision rather than an omission.
- [x] Note that the teardown guard is now reachable at `/spec-cancel`, and point
      at phase 1's path rather than re-explaining it.
- [x] Confirm no other lifecycle skill pushes a branch — `/spec-bug` never did
      and `/spec-hotfix` forbids it, so this makes the three consistent.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

**Added during the phase** — four shipped claims this change falsifies, found by
grepping for them rather than by a test:

- [x] `/spec-complete` step 3 said "`/spec-start` pushed this branch when it
      provisioned" to explain the remote-delete prompt. Now says a remote copy
      exists only because you pushed it by hand — which is decision 5's reasoning
      for keeping that prompt.
- [x] `env/teardown.js` cited the provision-time push twice: once justifying
      `-D` over `-d`, once gating the remote delete. Both rewritten.
- [x] `env-teardown.test.js`'s comment cited it a third time.
- [x] Re-anchor the two ordering tests in `assets.test.js` that located the
      commit step by the literal `**Commit it, and push the branch.**`. The
      ordering they assert is unchanged — only the anchor moved.

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

**Why the `-D` comment got a "do not simplify" warning.** Its argument for `-D`
was that `-d` refuses a branch ahead of its upstream, which fired on every spec
because provisioning had pushed one. Removing the push removes the *common* case
and not the case: one hand-published branch produces the same shape. Left as it
was, the comment reads as dead reasoning and invites a revert to `-d` that would
start refusing real teardowns.
