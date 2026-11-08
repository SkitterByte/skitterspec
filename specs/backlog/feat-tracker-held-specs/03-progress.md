---
github_issue_id: "#127"
---

# Phase 3 — Progress: block text and native fields ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the ticket shows how far along the work is, from the spec's own
checkboxes, in the block always and in a native field where configured.

## Tasks

- [ ] sync-core: pure `progressOf(phases)` → `{ ticked, total, percent,
      phase, phases }`; a spec with no checkboxes is cannot-tell and renders no
      progress line rather than `0%`
- [ ] Render `62% · phase 3 of 4` in the spec block and `n of m tasks` in each
      sub-issue block
- [ ] Per provider, an opt-in config naming a native number field; resolve it at
      run time and skip in one line when it is missing
- [ ] Tests: progress maths (no tasks, all ticked, nested checkboxes); the native
      field skipped silently when unconfigured
