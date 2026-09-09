---
linear_issue_id: "SKS-95"
---

# Phase 3 — Lifecycle skills report a missing header ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-review`, `/spec-complete` and `/spec-start` surface a missing
`Gating:` header when gating is on, report it, and carry on regardless.

## Tasks

- [ ] `assets/skills/spec-review/SKILL.md`: run `skitterspec gating check <spec>`
      in the validate step; when it reports, treat it as drift — grill for the
      decision and write the header as part of the update.
- [ ] `assets/skills/spec-complete/SKILL.md`: run the check in the double-check
      step and report the result. **Never refuse to complete** — say the decision
      was never recorded, offer to record it now, and finish either way.
- [ ] `assets/skills/spec-start/SKILL.md`: run the check after the spec moves into
      development and mention a missing header once, before building phase 1.
      Non-blocking — a spec authored before gating was enabled must not stall work.
- [ ] `assets/skills/spec-init/SKILL.md`: mention gating adoption alongside
      isolation, so a repair run surfaces the opt-in.
- [ ] State explicitly in each of the three skills that the check is advisory, so a
      future edit does not quietly promote it into a gate.
- [ ] Extend the asset tests to assert each reporting skill invokes
      `gating check`, and that each carries non-blocking wording — the regression
      that would matter most here is one of them starting to refuse.
- [ ] Run `node --test` — green before the phase is done.
