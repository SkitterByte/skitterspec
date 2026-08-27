# Phase 4 — Bug routing, docs & 9.0.0 release ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** bug-labelled issues land in `/spec-bug`, the docs describe both new
flows, and the superset ships as `@skitterbyte/skitterspec-linear@9.0.0`.

## Tasks

- [x] In the intake seam, match the issue's labels against `intake.bugLabels`; on
      a hit, `/spec` reports "this is a bug" and points at
      `/spec-bug <ISSUE-REF>` instead of authoring a Feature spec.
- [x] Make `/spec-bug` adopt an issue through the same seam — same identifier
      stamp, same dedup, same "leave its project alone" rule.
- [x] Update `packages/linear/assets/core/linear.config.md`,
      `linear.config.json.example` and `SETUP.md` with the `intake` block and the
      `projectId`-as-default semantics.
- [x] Update the committed dist READMEs (`packages/skitterspec-linear/README.md`,
      `packages/skitterspec/README.md`), `packages/common/README.md`,
      `MIGRATION.md` and `docs/index.html` with the picker and the two intake
      entry points.
- [x] Release `@skitterbyte/skitterspec-linear@9.0.0` (base `skitterspec` bumps
      only for the two seam markers), following `RELEASING.md`.
- [x] Add/extend tests: bug-label routing decision; the composed linear
      distribution contains both seam fragments and no raw markers. Run the
      project's typecheck and test commands — green before the phase is done.

## Notes

**There is no 9.0.0 to build on.** The phase assumed `feat-spec-as-issue-mapping`
had shipped as 9.0.0; its own Phase 4 explicitly deferred the version bump to
release time, and `packages/skitterspec-linear/package.json` is still `8.0.5` with
no `skitterspec-linear@9.0.0` tag. The breaking mapping change and these additive
features are both unreleased, so they go out together as **one** 9.0.0 — a second
major for the same upgrade would be noise for consumers.

The release itself is deliberately **not** run here: `scripts/release.js` tags
whatever `HEAD` is, and this branch hasn't landed. It belongs after
`/spec-complete` fast-forwards `main`.
