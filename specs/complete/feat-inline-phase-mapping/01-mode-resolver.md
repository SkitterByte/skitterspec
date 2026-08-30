# Phase 1 — Per-bucket resolution for the existing modes ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `mapping.phases` accepts a per-bucket map as well as a scalar, and one
resolver decides the mode for a spec — with `subissue` and `deferred` behaving
exactly as they do today.

## Tasks

- [x] Extend the config loader to accept `mapping.phases` as either a string or
      an object keyed by lifecycle bucket (`backlog`, `in-progress`, `complete`,
      `cancelled`). Validate every value against `PHASE_MAPPINGS` and every key
      against the bucket list — an unknown key or value is a clear error, matching
      how `fieldOwnership` and `states` already fail.
- [x] Decide and document the default for a bucket the map omits: `subissue`,
      so a partial map is additive rather than silently suppressing phases.
- [x] Add `phaseModeFor(bucket, config)` as the single resolution point, and
      route `phaseProjection` through it so `deferred`'s `UNSTARTED_BUCKETS` check
      becomes one expression of the resolver rather than a parallel rule.
- [x] Leave `phasesWithheld` reading the same predicate, so the projection and
      the CLI's "N phases deferred" line still cannot disagree.
- [x] Add tests: a scalar config resolves identically for every bucket (the
      compatibility guarantee); a map resolves per bucket; an omitted bucket
      defaults to `subissue`; a bad key and a bad value each fail loudly; the
      existing `deferred` tests still pass unchanged. Run the project's test
      command — green before the phase is done.

## Notes

No projection behaviour changes in this phase — it is the seam `inline` plugs
into, proven by the existing suite staying green (757 tests).

Landed as:

- `phaseModeFor(bucket, config)` in `packages/sync-core/src/normalize.js`,
  exported alongside `phaseProjection`.
- `mergePhaseMapping` in `packages/linear/src/config.js`, replacing the
  scalar-only `assign` + validation; `LIFECYCLE_BUCKETS` is derived from
  `Object.keys(DEFAULT_CONFIG.states)` rather than restated, so the two
  bucket-keyed maps cannot drift.
- Tests: `packages/sync-core/test/sync-phase-mode.test.js` (new) and six added
  cases in `packages/linear/test/config.test.js`.

`phaseModeFor` returns the **configured** mode, not the effective outcome:
`{ complete: 'deferred' }` resolves to `deferred` for `complete`, and the
`UNSTARTED_BUCKETS` gate in `phaseProjection` then makes it a no-op there — the
same no-op scalar `deferred` already is for a finished spec. Resolving it to
`subissue` instead would have been tidier in the projection but would make
Phase 3's "the mode in use" line misreport what the config says.
