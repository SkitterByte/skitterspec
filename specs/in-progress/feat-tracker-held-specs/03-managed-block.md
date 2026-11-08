---
github_issue_id: "#125"
---

# Phase 3 — Managed block + summary mode ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** under `mapping.description: "summary"`, a push writes only the managed
block and leaves every other line of the description as the team wrote it.

## Tasks

- [ ] `mapping.description` (`summary` default · `spec`) in all four provider
      configs and the `.example`/`.md` references
- [ ] `skitterspec update`: write `"description": "spec"` into a config that
      predates the key, so an upgrade rewrites no ticket
- [ ] sync-core: render the spec block — summary (`## Summary`, else
      Problem's first paragraph), acceptance criteria checklist, surfaces
      touched, gating, spec link — skipping each part whose source is absent
- [ ] sync-core: render the sub-issue block — the phase's Goal line (task
      count arrives in phase 4)
- [ ] sync-core: pure `spliceBlock(live, block, delimiter)` — replace an
      existing block, or insert one when absent; never touch outside text
- [ ] Provider apply: read the live description and write the splice (summary
      mode only; `spec` mode replaces as today)
- [ ] `compareStored`: hash the block only in summary mode
- [ ] `mapping.phases: "none"` — project no phase objects; existing linked
      sub-issues keep the current one-way behaviour pending the open question
- [ ] Adoption: skip the original-report comment in summary mode
- [ ] Tests: splice round-trips (absent block, present block, outside text
      edited, delimiter at either end); a stays-silent drift test where only the
      outside text changed; `spec` mode output byte-identical to today; a
      pre-key config pinned by `update`, a fresh one defaulting to `summary`
