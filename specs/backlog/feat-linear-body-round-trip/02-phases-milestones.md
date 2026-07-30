# Phase 2 — Phases ↔ Milestones round-trip + phase-file denormalizer ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** editing a phase locally pushes to its Linear Milestone, and a Milestone
edit in Linear pulls back into the right phase file — proven by fixtures and a live
smoke against team SKI.

## Tasks

- [ ] `normalize.js`: emit `milestones` as id-keyed items `{ id, name, goal }` —
      local `id` from each phase file's `linear_milestone_id` frontmatter, remote
      `id` from the Linear milestone. Map name ↔ phase title, goal ↔ phase
      `**Goal:**` / milestone description.
- [ ] `write.js`: add a **phase-file denormalizer** — apply a pulled milestone
      edit (name→heading/title, goal→`**Goal:**` line) into the matching phase file
      by `linear_milestone_id`; create a new phase file for a Linear-only milestone
      (naming/numbering per Open question 2); stamp `linear_milestone_id` on newly
      linked phases. Leave unrelated file content byte-untouched.
- [ ] `mcp.js`: add milestone **read/list** ops to the adapter (create/update
      already exist); confirm `save_milestone` upsert keys on `project` + `id`.
- [ ] `normalize.js` `buildDescription`: strip the `Phases` section from the pushed
      `description` when milestone sync is active (Decision 5).
- [ ] Wire `milestones` into `sync.fieldOwnership` as a keyed `both` field (Phase 4
      makes it opt-in default); push creates/updates milestones, pull applies edits
      via the denormalizer.
- [ ] Tests: fixtures for local phase edit → milestone update, milestone edit →
      phase-file write, new milestone → new phase file, id-match across a rename.
      Then a **live smoke** on team SKI (create project, push phases as milestones,
      edit one milestone in Linear, pull, assert the phase file updated). Typecheck
      + tests green.

## Notes

Milestone `progress` is read-only/derived — do not attempt to push it. The live
smoke reuses the SETUP.md flow; clean up the throwaway Linear project after.
