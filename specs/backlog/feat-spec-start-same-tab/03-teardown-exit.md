---
linear_issue_id: "SKS-107"
---

# Phase 3 — Teardown leaves the session before removing the tree ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-complete` and `/spec-cancel` unwind an `EnterWorktree` session
before `git worktree remove`, so finishing a spec from its own tab does not
strand the session in a deleted directory.

## Tasks

- [ ] Extend the "Standing in the worktree? Leave it before you tear it down"
      block in `packages/common/assets/skills/spec-complete/SKILL.md:174-184`
      with the two cases: entered via `EnterWorktree` → `ExitWorktree` with
      `action: "keep"`; a terminal you opened → `cd` to the primary checkout as
      today.
- [ ] Apply the same change to
      `packages/common/assets/skills/spec-cancel/SKILL.md:85` and its surrounding
      block, keeping the two skills' wording aligned.
- [ ] State why `keep` and never `remove`: `ExitWorktree` will not remove a
      worktree entered by path, and the `spec-env down` plan must stay the single
      thing that deletes — two deleters is how a guard gets bypassed.
- [ ] Keep the existing explanation of *why* order matters (`git worktree remove`
      succeeds on the tree you are standing in and every later command dies with
      `fatal: Unable to read current working directory`) — it is the reason the
      block exists and applies to both cases.
- [ ] Add prose tests asserting both skills name `ExitWorktree`, specify `keep`,
      and still carry the `cd` case for a manually-opened terminal.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`ExitWorktree` is a no-op outside an `EnterWorktree` session, so the instruction
is safe to give unconditionally — but the prose should still name both cases, so
a reader in a hand-opened tab knows `cd` is theirs.
