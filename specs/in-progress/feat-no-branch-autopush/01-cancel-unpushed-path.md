---
linear_issue_id: "SKS-163"
---

# Phase 1 — `/spec-cancel` handles the unpushed refusal ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** cancelling a spec whose work was never published refuses clearly and
offers both ways out — ready *before* phase 2 makes that path reachable.

## Tasks

- [ ] Add the unpushed-refusal path to
      `packages/common/assets/skills/spec-cancel/SKILL.md` step 3: on a blocked
      plan, relay the engine's reason and name both ways out — publish the branch
      so the work stays reachable, or `--force` accepting the loss.
- [ ] Say plainly that the work really would be destroyed: the worktree is the
      only copy, the branch is not landed, and `--force` means accepting that.
- [ ] **Never choose for them, and never publish on their behalf.** Print the
      `git push -u` command; do not run it. Publishing abandoned work to a shared
      remote is exactly the unasked-for act this spec exists to remove.
- [ ] Check `/spec-complete` needs no equivalent — its branch is landed by the
      time teardown runs, so the guard cannot fire there. Record the finding
      either way rather than leaving it implied.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

**This phase is deliberately first and is inert on its own.** Today the guard
almost never fires, because `/spec-start` has already pushed — so shipping this
alone changes nothing observable. That is the point: phase 2 is what makes the
path reachable, and it should land on prose that is already right.

The engine is not touched. `planDown` already returns the blocked verdict with
its reason (`env/teardown.js:58`); this phase is the skill learning to relay it
usefully instead of stopping at "it refused".
