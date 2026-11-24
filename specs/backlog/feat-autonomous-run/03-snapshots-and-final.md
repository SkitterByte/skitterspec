---
github_issue_id: "#298"
---

# Phase 3 — Phase snapshots, run index, final page ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** each autonomous phase leaves a kept, readable page; a run index lists
them live; the final page aggregates the whole run and offers its verdicts.

## Tasks

- [ ] Add `review --snapshot`: keep the render as `reviews/<spec>/phase-<n>.html`,
      read-only (accepts and notes allowed, no verdict buttons)
- [ ] Serve a run index page (same token, same tiers) listing each snapshot as
      it lands, with the phase's commit and report summary
- [ ] Add `review --final`: aggregate list of every phase's Follow-ups and
      Notes, unresolved reviewer findings and snapshot notes, then the phase
      index, then the whole-branch diff
- [ ] Add the final button set and verdicts `complete`, `push`, `pr`
      (committing), alongside `changes` and `discuss`
- [ ] Tests: snapshot survives the next phase's render; index lists phases in
      order; aggregate is empty-safe; final verdicts round-trip through claim
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/project-conventions.md`) — green before
      the phase is done.
