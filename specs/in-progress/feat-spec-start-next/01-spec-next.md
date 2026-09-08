---
linear_issue_id: "SKS-87"
---

# Phase 1 — Extract /spec-next ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-next` builds the next unfinished phase of the spec in flight,
and refuses when nothing is.

## Tasks

- [ ] Create `packages/common/assets/skills/spec-next/SKILL.md` from `spec-go`'s
      steps 3–6: pre-flight (prior work committed), mark the phase 🔄, tracker
      refresh (carrying the two `<!-- seam:… -->` progress markers), build with
      tests, record progress, mirror, report.
- [ ] In-flight resolution, in order: the live spec of this checkout (receipt);
      the spec of the worktree you are standing in; in checkout mode, the spec
      of the current branch. On base with nothing in flight, refuse:
      "no spec in flight — `/spec-start <name>`" — never fall back to guessing
      from conversation context, because building the wrong spec's phase writes
      real code.
- [ ] Description within the 500-char budget with `Use when` triggers ("build
      the next phase", "continue the spec").
- [ ] Leave `spec-go` untouched this phase — both exist on the branch until
      Phase 4.
- [ ] Add/extend tests: frontmatter, seams, budget, the refusal wording; run
      `pnpm build` + `pnpm test` — green before the phase is done.
