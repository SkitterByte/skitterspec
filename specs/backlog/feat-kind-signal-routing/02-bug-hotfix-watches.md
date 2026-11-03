---
github_issue_id: "#102"
---

# Phase 2 — `/spec-bug` and `/spec-hotfix` watches ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the two defect doors watch for escalation (hotfix/incident) and
de-escalation (not a defect → `/spec`), with the same confirm-first, carry-on
contract as Phase 1.

## Tasks

- [ ] Add the watch to `packages/common/assets/skills/spec-bug/SKILL.md`:
      escalate on an on-released signal (→ `/spec-hotfix`) or a live-outage
      signal (→ `/spec-incident`); de-escalate when the grill reveals the ask
      is new/changed behaviour rather than a defect (→ `/spec`, carrying the
      kind suggestion). Reference the matrix in `spec-planning.md`.
- [ ] Add the watch to `packages/common/assets/skills/spec-hotfix/SKILL.md`:
      escalate on a live-outage signal (→ `/spec-incident`); de-escalate when
      the defect is not on a released version (→ `/spec-bug`) or is not a
      defect at all (→ `/spec`).
- [ ] Mind the test-first shape: in `/spec-bug` the watch applies **before the
      failing test is written** — once red exists, the repro is evidence, and
      escalation (it reproduces on the released tag too → hotfix) carries the
      failing test across in the seeded context.
- [ ] Extend the assets test to pin both skills' watch sections. Run the
      package tests — green before the phase is done.

## Notes

The existing label-routing matrix text in the provider seams
(`packages/*/assets/seams/spec-tracker-intake.md`) is untouched — Decision 7.
