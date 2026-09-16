---
linear_issue_id: "SKS-287"
---

# Phase 2 — `spec-sync assign` refuses what it cannot push ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine stops telling you to push something the push will drop —
proven by `spec-sync assign` in an un-owning repo writing nothing and exiting
non-zero.

## Tasks

- [ ] In `specSyncAssign` (`packages/linear/src/cli-sync.js:481`), add the
      ownership check to the existing `problems` list so it inherits that
      function's refusal shape, wording and exit code. Applies to **both**
      `--to` and `--release` (decision 6).
- [ ] Word the refusal so the exit is one config line — name
      `sync.fieldOwnership.assignee` and the value that turns it back on.
- [ ] Align `/spec-claim`'s opt-in paragraph
      (`packages/linear/assets/skills/spec-claim/SKILL.md`) with the engine now
      enforcing the same rule, so the skill is not the only thing holding it.
- [ ] Tests, in `packages/linear/test/cli-assign.test.js`: `--to` refuses and
      writes no frontmatter; `--release` refuses and removes nothing; the exit
      code matches the other refusals in that function.
- [ ] **Stays-silent test:** an owning repo assigns and releases exactly as
      before — the guard fires at nobody healthy. This is the test that would
      have caught the guard being written against key-presence instead of
      value.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Decisions 5 and 6. This phase is independently shippable and is the half that
stands alone as a bug fix: it is correct whether or not phase 3 ever lands,
because a repo can decline ownership either way once phase 1 is in.
