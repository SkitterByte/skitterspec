---
linear_issue_id: "SKS-151"
---

# Phase 3 — `/spec-next` accepts an explicit worktree root ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-next` can build a spec in a worktree it is not standing in —
but only when handed that path explicitly — and proves it did not leak.

## Tasks

- [x] Add `--worktree <path>` to `/spec-next`'s resolution in
      `packages/common/assets/skills/spec-next/SKILL.md`, as a path that runs
      **before** the existing three and answers only when given.
- [x] State plainly why this is not a loosening: the refusal exists against
      guessing, a named path is not a guess, and a bare `/spec-next` still
      refuses exactly as today.
- [x] Document the remote-build discipline for that path — absolute writes under
      the worktree, every command `cd "<worktreePath>" &&` prefixed, typecheck
      and tests run in the worktree.
- [x] Refuse when `--worktree` names a path that is not a provisioned worktree
      for the resolved spec, rather than building somewhere arbitrary — via
      `spec-env resolve --dir <path>`, reading its output rather than its exit
      status.
- [x] Record the baseline on this path before writing anything, and run
      `spec-env resolve <spec> --assert-primary-clean` after progress is recorded
      and before anything is reported done.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

Rules 1–3 of the existing resolution are untouched. The asset tests that guard
`/spec-next`'s refusal should keep passing unchanged — if one needs editing to
accommodate this, that is a signal the flag reached further than intended.

The note above was tested and held. Rules 1-3 and the in-context refusal are
byte-identical after this phase — the only lines the diff removes from the
resolution section are the frontmatter description and the list's lead-in. One
asset test did need editing, but it guarded a sentence in `/spec-start` claiming
`/spec-next` was unchanged, not the refusal itself; that claim is now narrowed to
rules 1 to 3 rather than dropped.
