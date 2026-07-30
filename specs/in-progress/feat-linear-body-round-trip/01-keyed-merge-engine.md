# Phase 1 — Per-item (id-keyed) three-way merge in sync-core ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the three-way engine can compare a field that is a **keyed collection**
(items with a stable `id`) item-by-item, emitting per-item outcomes, proven by
fixtures — no Linear specifics yet.

## Tasks

- [ ] Define a config marker for keyed-collection fields (e.g.
      `sync.keyedFields: { milestones: "id", tasks: "id" }`) loaded/validated in
      `packages/linear/src/config.js`.
- [ ] Extend `compare.js`: for a keyed field, match items across local/remote/base
      by `id` and classify each item (`unchanged`/`added`/`edited`/`removed`/
      `conflict`) via the existing scalar three-way on the item's content hash;
      collapse through ownership like scalar fields.
- [ ] Return a structured per-field result that carries item-level outcomes
      (keeping the existing scalar shape for non-keyed fields).
- [ ] Update `pull.js`/`push.js` orchestration to consume item-level outcomes:
      apply added/edited items, refuse item-level `conflict` (unless `--force`),
      surface `removed` as report-only divergence (Decision 7).
- [ ] Store keyed collections in the base sidecar keyed by `id` so per-item base
      lookups are stable across reorder.
- [ ] Add sync-core tests: item added on one side, edited on each side, concurrent
      edits to different items (no conflict), concurrent edit to the same item
      (conflict), removal surfaced but not applied. Run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before done.

## Notes

Keep non-keyed (scalar/whole-field) behaviour byte-identical — this phase only
*adds* a code path. Item content hash reuses `hashField` on the item minus its
`id` so an id-only change isn't a content edit.
