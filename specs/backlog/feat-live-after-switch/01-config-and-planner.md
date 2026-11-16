---
github_issue_id: "#208"
---

# Phase 1 — Config and planner: `live.afterSwitch` decided per switch ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `live.afterSwitch` loads with `afterLand`'s grammar, and `planTake` /
`planRelease` return which entries run for a given range — proven by unit tests,
with no CLI behaviour changed yet.

## Tasks

- [ ] Normalise `live.afterSwitch` in `src/env/config.js` with
      `normalizeAfterLand` (so `{ setup: true }` expands the same way); default
      `[]`; document it in the config JSDoc beside `live.migrations`.
- [ ] Lift `afterLandFor` / `decide` / `asEntry` out of `src/env/integrate.js`
      into a shared helper that takes the entry list, `cwd` and range; keep
      `afterLandFor` as a thin caller so every integrate test reads the same.
- [ ] Add `afterSwitch` to `planTake` and `planRelease` results
      (`{ cwd, commands, entries, range }`), built from a new ctx `range`
      (`string[]` known, `null` unknown); a blocked or no-op plan carries an
      empty one.
- [ ] Tests (`test/env-live.test.js`, config tests): plain string always runs;
      `{ run, when }` matched / skipped; unknown range runs conditionals; empty
      known range skips them; `{ setup: true }` expansion; **stays silent** —
      unset key gives an empty `afterSwitch` and every other plan field
      unchanged; existing integrate tests green untouched.
- [ ] Run `pnpm test` — green before the phase is done.
