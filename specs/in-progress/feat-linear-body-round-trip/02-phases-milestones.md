# Phase 2 — Phases ↔ Milestones round-trip + phase-file denormalizer 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress (2a done, 2b next)

**Goal:** editing a phase locally pushes to its Linear Milestone, and a Milestone
edit in Linear pulls back into the right phase file — proven by fixtures and a live
smoke against team SKI.

Delivered in two commits: **2a** the read-model (normalize + adapter read +
description-strip + fixtures), **2b** the write-side (denormalizer + push/pull
item-application + live smoke).

## Tasks — 2a (read-model) ✅

- [x] `normalize.js`: emit `milestones` as id-keyed items `{ id, name, goal }` —
      local `id` from each phase file's `linear_milestone_id` frontmatter, remote
      `id` from the Linear milestone. Map name ↔ phase title, goal ↔ phase
      `**Goal:**` / milestone description.
- [x] `mcp.js`: add milestone **read/list** op to the adapter (`listMilestones`);
      `save_milestone` upsert keys on `project` + `id` (create/update already exist).
- [x] `normalize.js` `buildDescription`: strip the `Phases` section from the pushed
      `description` when milestones are keyed (Decision 5).
- [x] Read-model fixtures: keyed `{id,name,goal}` from phase frontmatter, Phases
      stripped when keyed, remote milestones normalized, a Linear milestone edit
      classifying as a per-item pullable change. Suite green (260).

## Tasks — 2b (write-side) ⬜

- [ ] `write.js`: add a **phase-file denormalizer** — apply a pulled milestone
      edit (name→heading/title, goal→`**Goal:**` line) into the matching phase file
      by `linear_milestone_id`; create a new phase file for a Linear-only milestone
      (naming/numbering per Open question 2); stamp `linear_milestone_id` on newly
      linked phases. Leave unrelated file content byte-untouched.
- [ ] Wire `pull.js`/`push.js` to apply keyed milestone items (the Phase 1
      deviation): push creates/updates milestones via the adapter, pull applies
      edits via the denormalizer, removals report-only.
- [ ] Tests: local phase edit → milestone update, milestone edit → phase-file
      write, new milestone → new phase file, id-match across a rename. Then a
      **live smoke** on team SKI. Typecheck + tests green.

## Notes

Milestone `progress` is read-only/derived — do not attempt to push it. The live
smoke reuses the SETUP.md flow; clean up the throwaway Linear project after.
