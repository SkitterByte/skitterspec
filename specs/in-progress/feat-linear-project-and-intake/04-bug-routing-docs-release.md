# Phase 4 — Bug routing, docs & 9.1.0 release ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** bug-labelled issues land in `/spec-bug`, the docs describe both new
flows, and the superset ships as `@skitterbyte/skitterspec-linear@9.1.0`.

## Tasks

- [ ] In the intake seam, match the issue's labels against `intake.bugLabels`; on
      a hit, `/spec` reports "this is a bug" and points at
      `/spec-bug <ISSUE-REF>` instead of authoring a Feature spec.
- [ ] Make `/spec-bug` adopt an issue through the same seam — same identifier
      stamp, same dedup, same "leave its project alone" rule.
- [ ] Update `packages/linear/assets/core/linear.config.md`,
      `linear.config.json.example` and `SETUP.md` with the `intake` block and the
      `projectId`-as-default semantics.
- [ ] Update the committed dist READMEs (`packages/skitterspec-linear/README.md`,
      `packages/skitterspec/README.md`), `packages/common/README.md`,
      `MIGRATION.md` and `docs/index.html` with the picker and the two intake
      entry points.
- [ ] Release `@skitterbyte/skitterspec-linear@9.1.0` (base `skitterspec` bumps
      only for the two seam markers), following `RELEASING.md`.
- [ ] Add/extend tests: bug-label routing decision; the composed linear
      distribution contains both seam fragments and no raw markers. Run the
      project's typecheck and test commands — green before the phase is done.
