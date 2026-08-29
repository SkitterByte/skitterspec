# Phase 3 — Surface it: CLI, skills, docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** someone reading a push or a status report can tell which phase mode
applied and why, and the config is documented well enough to adopt without
reading the engine.

## Tasks

- [ ] Report the resolved mode in `spec-sync push` and `spec-sync status`, so an
      `inline` spec with no sub-issues is obviously deliberate rather than a
      parse failure — the same reasoning that put the deferred count on the plan.
- [ ] Carry the mode on the plan (a plan field, not a stderr warning) so the
      skill applying it can relay it; `--json` routes warnings to stderr and the
      skill is the consumer that needs this.
- [ ] Update `/spec-push` and `/spec-status` to relay the mode.
- [ ] Document `mapping.phases` in the package README: both forms, the three
      values, the per-bucket default, and the non-destructive switching rule.
- [ ] Note the adoption path for an established repo — set `complete: inline`
      before a first backfill, so finished specs never mint sub-issues at all.
- [ ] Add tests covering the reported mode in both CLI outputs and its presence
      on the plan. Run the project's test command — green before the phase is done.
