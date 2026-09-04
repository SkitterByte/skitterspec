---
linear_issue_id: "SKS-42"
---

# Phase 1 — `release.stages` config + name validation ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a project can declare its own deployment ladder, and a stage name the
workspace lacks fails loudly instead of pushing clean and never moving.

## Tasks

- [ ] Add `release: { stages: [] }` to `DEFAULT_CONFIG` and `defaults()` in
      `packages/linear/src/config.js`, with the comment naming why the ladder is
      project-owned rather than shipped.
- [ ] Validate the block on load: `stages` is an array of `{key, state}`, both
      non-empty strings; keys unique; a malformed entry is a hard error (the same
      treatment `sync.fieldOwnership` gets). An absent `release` block is not an
      error — it is the opt-out.
- [ ] Extend `validateStates` so `release.stages[].state` names are checked
      against the workspace alongside `config.states`, and reach all three call
      sites (`cli-sync.js:324`, `:450`, `:1768`).
- [ ] Extend `spec-sync states` output to list the declared ladder next to the
      bucket map, so one command shows the whole state vocabulary.
- [ ] Add the `release` block to `linear.config.json.example` and document it in
      `linear.config.md` (fields, ordering semantics, and that absence = off).
- [ ] Tests: valid ladder loads; malformed entries rejected with a useful
      message; **absent `release` block loads clean and changes nothing** (the
      stays-silent case); an unknown stage name is reported by `validateStates`
      at each call site.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`LIFECYCLE_BUCKETS` is derived from `Object.keys(DEFAULT_CONFIG.states)` so the
two bucket-keyed maps cannot drift. `release.stages` is deliberately **not**
bucket-keyed — it is an open, ordered list in the project's own vocabulary, and
must not be folded into that derivation.
