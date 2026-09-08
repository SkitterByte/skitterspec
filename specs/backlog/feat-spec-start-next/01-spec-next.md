---
linear_issue_id: "SKS-87"
---

# Phase 1 — Extract /spec-next ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-next` builds the next unfinished phase of the spec you are
standing in — the command a hand-off tab can run, and the one you re-run per
phase.

## Tasks

- [ ] Create `packages/common/assets/skills/spec-next/SKILL.md` from `spec-go`'s
      steps 3–6: pre-flight (prior work committed), mark the phase 🔄, tracker
      refresh (carrying `spec-go`'s two `<!-- seam:… -->` progress markers),
      build with tests, record progress, mirror, report. Target resolution:
      argument, else the spec of the worktree/branch you are standing in, else
      the spec in context.
- [ ] Keep the live check (worktree mode: a live spec builds in the primary
      checkout on the branch) — it moves here because building is now this
      skill's job.
- [ ] Description carries the old build triggers ("let's build the next phase",
      "start this spec" moves to spec-start) within the 500-char budget and a
      `Use when` clause (`skill-budget.test.js` enforces both).
- [ ] Leave `spec-go` untouched this phase — both exist on the branch until
      Phase 4 retires it; the compose guard tolerates that.
- [ ] Add/extend tests: frontmatter valid, seams present, budget/triggers pass;
      run `pnpm build` + `pnpm test` — green before the phase is done.
