---
linear_issue_id: "SKS-179"
---

# Phase 2 — Collapse the teardown exit to a `cd` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the two teardown skills tell a session standing in the worktree how to
actually get out of it, in one branch, with no tool that prompts.

## Tasks

- [ ] In `packages/common/assets/skills/spec-complete/SKILL.md` and
      `packages/common/assets/skills/spec-cancel/SKILL.md`, delete the
      **`/spec-start` moved this session in** branch and its `ExitWorktree`
      instruction, along with the `action: "keep"` paragraph and the
      "Always `keep`, never `remove`" paragraph that only existed to constrain
      that call.
- [ ] Collapse what remains to the single instruction both branches now want:
      `cd` to the primary checkout before running the teardown commands.
- [ ] **Keep the reasoning paragraphs verbatim** — "Not because git refuses — it
      does not", the `Unable to read current working directory` consequence, and
      "the only ordering that survives". They are why the step exists and they
      are unchanged by the mechanism.
- [ ] Keep `spec-env down` as the single thing that deletes a worktree. That
      argument survives the loss of `ExitWorktree`: it was about not having a
      second deleter racing the teardown guards, not about which tool relocates
      the session.
- [ ] Rewrite `packages/common/test/assets-teardown-exit.test.js`: drop the three
      assertions pinning `ExitWorktree`, `action: "keep"` and the two-branch
      shape; add one pinning the `cd`; keep the reasoning assertions and keep the
      final test that the block is **identical in both skills**.
- [ ] Add an assertion that neither skill names `ExitWorktree` any more, so the
      removal is guarded rather than merely done.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

**This phase is what makes phase 1 safe to ship, and the ordering is real.**
Today the leave-first block is unreachable — nothing ever moves the session in,
so nobody follows it. Phase 1 makes it reachable for the first time, and the
branch a reader lands on is the one that tells them to call a tool which does
nothing for a `cd`-moved session. Either phase alone is fine; phase 1 without
phase 2 ships a workflow that moves you in and then mis-describes getting out.

The identical-block test at the end of the existing file stays for the same
reason it was written: both skills carry the same block, and a fix applied to one
is the shape the drift takes.
