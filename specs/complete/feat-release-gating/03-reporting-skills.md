---
linear_issue_id: "SKS-95"
---

# Phase 3 — Lifecycle skills report a missing header ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-review`, `/spec-complete` and `/spec-start` surface a missing
`Gating:` header when gating is on, report it, and carry on regardless.

## Tasks

- [x] `assets/skills/spec-review/SKILL.md`: run `skitterspec gating check <spec>`
      in the validate step; when it reports, treat it as drift — grill for the
      decision and write the header as part of the update.
- [x] `assets/skills/spec-complete/SKILL.md`: run the check in the double-check
      step and report the result. **Never refuse to complete** — say the decision
      was never recorded, offer to record it now, and finish either way.
- [x] `assets/skills/spec-start/SKILL.md`: run the check after the spec moves into
      development and mention a missing header once, before building phase 1.
      Non-blocking — a spec authored before gating was enabled must not stall work.
- [x] `assets/skills/spec-init/SKILL.md`: mention gating adoption alongside
      isolation, so a repair run surfaces the opt-in.
- [x] State explicitly in each of the three skills that the check is advisory, so a
      future edit does not quietly promote it into a gate.
- [x] Extend the asset tests to assert each reporting skill invokes
      `gating check`, and that each carries non-blocking wording — the regression
      that would matter most here is one of them starting to refuse.
- [x] Run `node --test` — green before the phase is done.

## Notes

**As built.**

- The advisory paragraph is **identical in all three skills**, deliberately. It is
  the property most likely to be "tightened" by a later edit, and one shared
  wording makes a divergence obvious in a diff. A test asserts each carries it.
- `/spec-start` gets its own step **4b**, after the spec moves into development
  and before phase 1 — the cheapest moment to decide is before any code exists.
- `/spec-review` treats a missing header as **drift**, not as a lint failure, so
  it flows into the grill and update steps the skill already has rather than
  bolting a new mechanism alongside them.
- `/spec-init` offers gating as **step 0b**, and says it is orthogonal to
  isolation — a project can adopt either, both or neither. Bundling them would
  have made adopting worktrees drag in a policy nobody asked for.
- One emphasis span I wrote crossed a line break in `/spec-review`; fixed.
  A second, in `/spec-start`, came from this session's earlier spec and is
  already landed on `main` — left for a separate tidy rather than mixed in here.
