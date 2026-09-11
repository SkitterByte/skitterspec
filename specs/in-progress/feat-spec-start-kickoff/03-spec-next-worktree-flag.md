---
linear_issue_id: "SKS-151"
---

# Phase 3 — `/spec-next` accepts an explicit worktree root ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-next` can build a spec in a worktree it is not standing in —
but only when handed that path explicitly — and proves it did not leak.

## Tasks

- [ ] Add `--worktree <path>` to `/spec-next`'s resolution in
      `packages/common/assets/skills/spec-next/SKILL.md`, as a fourth path that
      runs **before** the existing three and answers only when given.
- [ ] State plainly why this is not a loosening: the refusal exists against
      guessing, a named path is not a guess, and a bare `/spec-next` still
      refuses exactly as today.
- [ ] Document the remote-build discipline for that path — absolute writes under
      the worktree, every command `cd "<worktreePath>" &&` prefixed, typecheck
      and tests run in the worktree.
- [ ] Refuse when `--worktree` names a path that is not a provisioned worktree
      for the resolved spec, rather than building somewhere arbitrary.
- [ ] Run `spec-env resolve <spec> --assert-primary-clean` **before** the phase
      commit on this path, and stop on a non-zero exit with the engine's own
      message.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

Rules 1–3 of the existing resolution are untouched. The asset tests that guard
`/spec-next`'s refusal should keep passing unchanged — if one needs editing to
accommodate this, that is a signal the flag reached further than intended.
