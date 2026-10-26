---
github_issue_id: "#36"
---

# Phase 1 — Config: conditional entries and the setup shorthand ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `loadEnvConfig` normalises `afterLand` to `{ run, when }[]` and
`setup` entries' triggers, expanding `{ setup: true }`, with existing configs
loading exactly as before — proven by `env-config` tests.

## Tasks

- [x] Normalise `afterLand` entries: a string → `{ run, when: null }`;
      `{ run, when }` with `when` a string or array of non-empty strings →
      kept; anything else dropped, never thrown on (same rule as today)
- [x] Let `setup` accept `{ run, when }`: `config.setup` stays `string[]` (the
      `run` values, in order); entries with `when` also go to
      `config.setupTriggers` as `{ run, when }`
- [x] Expand `{ setup: true }` in `afterLand`, in place, to `setupTriggers`
- [x] Move `globToRegExp` out of `src/env/live.js` into a shared helper; keep
      `migrationsHit` behaviour unchanged
- [x] Update the existing `afterLand` tests in `env-config.test.js` to the new
      shape, and add: object entries kept, `when` string coerced to array, bad
      `when` dropped, setup objects flatten to `string[]`, shorthand expands in
      position, shorthand with no triggers expands to nothing
- [x] Assert `bootstrap` still runs every setup entry, `when` or not
- [x] Run `pnpm -r test` — green before the phase is done

## Notes

Downstream of `config.afterLand` (`afterLandFor`) still reads strings until
phase 2; map `run` there in this phase so the suite stays green between phases.
