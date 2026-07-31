# Phase 1 — Per-item (id-keyed) three-way merge in sync-core ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the three-way engine can compare a field that is a **keyed collection**
(items with a stable `id`) item-by-item, emitting per-item outcomes, proven by
fixtures — no Linear specifics yet.

## Tasks

- [x] Define a config marker for keyed-collection fields
      (`sync.keyedFields: { milestones: "id", tasks: "id" }`) loaded/validated in
      `packages/linear/src/config.js` (default empty — opt-in per Decision 8).
- [x] Extend `compare.js`: for a keyed field, match items across local/remote/base
      by `id` and classify each item (`unchanged`/`added`/`edited`/`removed`/
      `conflict`) via the scalar three-way on the item's content hash; collapse
      through ownership into per-item `pushable`/`pullable`.
- [x] `classify` returns per-item outcomes (`items`) on a keyed field while keeping
      the existing scalar shape for non-keyed fields (byte-identical) and an
      aggregate field-level status for the summary.
- [x] Base sidecar stores the collection as an array of `{id,…}`; compare indexes
      by `id` so per-item base lookups are stable across reorder.
- [x] Add sync-core tests (`sync-compare-keyed.test.js`, 12 cases) + config tests:
      add/edit each side, concurrent-different (no conflict), concurrent-same
      (conflict), removal report-only, id-only reorder = unchanged, converged,
      pull/push conflict resolution. Full suite green (256).

## Notes

Keep non-keyed (scalar/whole-field) behaviour byte-identical — this phase only
*adds* a code path. Item content hash reuses `hashField` on the item minus its
`id` so an id-only change / reorder isn't a content edit.

**Scope refinement (2026-07-30):** wiring `pull.js`/`push.js` to *apply* item
outcomes (create/update the matching milestone/issue, write phase files) is
inseparable from the Linear adapter + phase-file denormalizer, which live in
Phases 2–3. So Phase 1 delivers the classifier, config, base keying and its
fixtures; pull/push item-application moves to Phase 2. `classify` exposes the
per-item outcomes now so Phase 2 consumes them.
