---
linear_issue_id: "SKS-105"
---

# Phase 1 — `/spec-start` enters the worktree in-session ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** in `worktree` mode `/spec-start` ends with this session standing in the
provisioned worktree, so `/spec-next` runs in the same tab — proven by prose tests
over the skill.

## Tasks

- [ ] Rewrite step 3.2 of `packages/common/assets/skills/spec-start/SKILL.md` so
      the branch is chosen from cwd **before** any tool call: cwd already inside a
      worktree (or no `EnterWorktree` available) → hand off as today; otherwise
      call `EnterWorktree` with the worktree path.
- [ ] State the order explicitly — provision, bootstrap, housekeep via
      `git -C <worktreePath>`, **then** enter. Entering earlier would leave the
      `git -C` commands addressing the tree from inside itself.
- [ ] Say why the worktree→worktree case degrades (target must be under
      `.claude/worktrees/`; this project's root is `../{repo}-wt`), so the next
      reader does not "fix" it by removing the branch.
- [ ] Keep the "do not move the branch into this checkout" rule and the
      `/spec-live` warning intact — entering the worktree is the opposite of
      moving the branch out of it, and the confusion is worth pre-empting.
- [ ] Restate that `/spec-next`'s resolution is unchanged and that rule 2 is what
      now answers, so nobody loosens it later believing this spec required it.
- [ ] Update the `checkout` mode section only if it references the hand-off; it
      has no worktree to enter and must otherwise stay as-is.
- [ ] Update the hand-off sentence in
      `packages/common/assets/rules/spec-planning.md:48-50` — "one terminal
      session per spec, which `/spec-start` sets up for you" is no longer the
      default path.
- [ ] Add prose tests in `packages/common/test/` following
      `assets-spec-start-gate.test.js`: assert the skill names `EnterWorktree`,
      names the already-in-a-worktree degrade branch, and **does not** claim the
      operator must open or switch to another session in the non-degraded path.
- [ ] Add the stays-silent test required by `.claude/rules/negative-checks.md` §3:
      assert the degrade branch is described as a *condition checked first*, not
      as a recovery from a failed call — the check must not accuse a healthy
      primary-checkout start.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`EnterWorktree` is gated on being told to work in a worktree by the user or by
project instructions. A lifecycle skill instructing it is project instruction, so
the call is in-contract — worth a line in the skill so it does not read as a
tool used out of turn.
