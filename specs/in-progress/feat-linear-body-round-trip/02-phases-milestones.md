# Phase 2 — Phases ↔ Milestones round-trip + phase-file denormalizer ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

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

## Tasks — 2b (write-side) ✅

- [x] `write.js`: **phase-file denormalizer** — apply a pulled milestone edit
      (name→heading/title, goal→`**Goal:**` line) into the matching phase file by
      `linear_milestone_id`; create a new phase file for a Linear-only milestone;
      stamp `linear_milestone_id`. Unrelated content byte-untouched.
- [x] Wire `pull.js` to apply keyed milestone items via the denormalizer
      (Linear→repo), re-normalize so the base goes in-sync, removals report-only;
      add item-level conflict detection to pull **and** push (a same-item conflict
      blocks). Normalize goal-label strip so goals hash-equal across the boundary.
- [x] `cli-sync.js`: surface keyed applies/creates/removes in the pull summary.
- [x] Tests: denormalizer unit (5) + pull integration (milestone edit → phase
      file, removal reported, new milestone → new file) + **live pull smoke** on
      team SKI (edited a milestone in Linear → pull → phase file updated → in
      sync). Suite 268 green.
- [x] **Push-side milestone create/update (repo→Linear).** `push.js` emits a
      `milestonesPush` plan (create/update) — the offline engine can't write Linear
      objects, so the `/spec-push` skill applies it via `save_milestone` and stamps
      new ids; base self-heals (id:null items converge once stamped). 3 push-plan
      fixtures + a **live push smoke** (local goal edit → plan → save_milestone →
      Linear updated → in sync). Suite 271 green.

## Notes

Milestone `progress` is read-only/derived — do not attempt to push it. The live
smoke reuses the SETUP.md flow; clean up the throwaway Linear project after.
