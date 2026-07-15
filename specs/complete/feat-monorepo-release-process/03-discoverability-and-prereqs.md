# Phase 3 — Release-doc discoverability + prerequisites ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Turn "a release doc exists" into "an operator can actually find it and
run a release." Make `RELEASING.md` reachable from a root `README`, document the
publish prerequisites, and stop the orphaned single-package-era `CHANGELOG.md` /
`RELEASES.md` from reading as the current record.

## Tasks

- [x] Add a root `README.md` (none exists): what the monorepo is, the two
      published distributions (link their per-package READMEs), the dev commands
      (`npm run build`, `npm test`), and a **Releasing** section linking to
      `RELEASING.md` with the one-line "never `npm version` at the root" rule.
- [x] Add a **Prerequisites** section to `RELEASING.md`: logged in to npm
      (`npm whoami`), publish rights to the `@skitterbyte` scope, and 2FA/OTP if
      the account enforces it at publish. Cover what an operator needs *before*
      `--publish` works.
- [x] Add a short **stale-doc banner** to the top of the orphaned root
      `CHANGELOG.md` and `RELEASES.md`: they describe single-package `skitterspec
      1.0.x`, are no longer generated (the scripts were removed in Phase 2), and
      per-package changelog/release-note generation is a later deferred spec.
- [x] Add/extend tests: assert a root `README.md` exists and references
      `RELEASING.md`. Run the project's typecheck + test commands — green before
      the phase is done. *(1 new test; 214 total green.)*

## Notes

- Surfaced during Phase 2 review: the release *procedure* was complete, but the
  doc was undiscoverable (no root README linked it) and silent on publish
  prerequisites — both are what make the doc usable, not just present.
