---
linear_issue_id: "SKS-183"
---

# Phase 2 — `/spec-next`: the offer goes last and asks ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the phase report ends on a question about the page, so the offer is the
last thing on screen rather than quoted output buried mid-report.

## Tasks

- [ ] Rewrite step 5's output shape in
      `packages/common/assets/skills/spec-next/SKILL.md` — prose addressed to the
      reader, not a fenced block, ending in a question
      (*"Want a written review of it before you commit?"*).
- [ ] Move the offer **after** the `Next: phase N` line in step 6's report
      ordering, and say so explicitly in both steps, since the two currently
      disagree about what comes last.
- [ ] Keep every existing rule intact and restate none of them loosely: render
      after tests pass and before the commit, never write the review unasked,
      never publish, never fatal, silent no-op without
      `specs/.core/env.config.json`.
- [ ] Keep relaying the engine's `open:` file:// URL rather than the bare path.
- [ ] Extend `packages/common/test/assets-review.test.js` to pin the new shape:
      the offer is a question, it carries the `open:` URL, and it is positioned
      after the next-phase line.
- [ ] **Stays-silent test:** a project with no `env.config.json` still produces
      no offer, no page and no explanation of the absence.
- [ ] Run the project's test command — green before the phase is done.

## Notes

Non-blocking on purpose (decision 4). The operator chains `/commit && /spec-next`
as one line and works through phases quickly; a question that ends the turn would
tax every phase to fix a problem that being last already fixes.
