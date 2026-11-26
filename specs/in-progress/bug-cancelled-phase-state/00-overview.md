---
github_identifier: "#324"
github_url: "https://github.com/SkitterByte/skitterspec/issues/324"
---

# Bug: a phase cancelled in place (➖) reads as not started

> **Type:** Bug
> **Name:** bug-cancelled-phase-state
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/324
> **Area:** `packages/common/src/env/` (phases, resolve, nextaction, resume, disposition, specstate, inflight, epic), `packages/sync-core/src/normalize.js`, `write.js`, phase-status wording in the spec/spec-review/spec-next/spec-complete skills and `spec-format.md`
> **Docs:** reference

## Symptom

skitterspec reads a phase's status from the emoji ending its H1 and knew only
⬜, 🔄 and ✅. A phase cancelled in place, kept for the record, read as not
started everywhere. Reported from ereqs on 2026-11-26:

> spec feat-inbox-search-performance has phases 1–3 ✅ and phases 4 and 5
> headed `… — cancelled ➖`. Clean worktree: `skitterspec status` printed
> `3 of 5 phases done … next: /spec-next — phase 4`. `spec-sync plan` printed
> `no ⬜/🔄/✅ in the heading — projecting as not-started` for both files and
> planned AB#986 and AB#989 at backlog, leaving ➖ in their titles.

## Root cause

The status vocabulary was closed over three emoji in every reader:
`phases.js` `phaseProgress` counted only ✅ as done, `nextaction.js`
`nextAction` picked `phases.find((p) => !p.done)`, `resolve.js` `readPhases`
set `hasNextPhase: done < files.length`, `resume.js` `blockingNext` took the
first non-✅ phase, and `disposition.js` listed every non-✅ index row. In
sync-core, `normalize.js` `EMOJI_STATUS` and its `[⬜🔄✅]` regexes (index row,
heading, title strip, status line) and `write.js`'s title strip had no ➖, so
`phaseStateBucket` fell back to `backlog` and the lint warned.

**Decision:** a cancelled phase is **excluded from the total** and counted on
its own — `3 of 3 phases done, 2 cancelled`. Folding it into "done" would
overstate the work built; excluding it makes "all done" mean what it says.

## Failing test (red)

- `packages/common/test/env-cancelled-phase.test.js` — `phaseIsCancelled`,
  progress excludes ➖ from the total, a spec whose remaining phases are all ➖
  reports `/spec-complete` and never `/spec-next`, a ➖ before an open phase is
  skipped, `readPhases().hasNextPhase` is false, status counts match, a blocker
  on a ➖ phase holds nothing, disposition ignores ➖ rows.
- `packages/sync-core/test/sync-cancelled-phase-heading.test.js` — a ➖ phase
  projects as `cancelled` with its title stripped, draws no lint warning, and
  the phase index reads ➖ as cancelled.

Run: `node --test packages/common/test/env-cancelled-phase.test.js packages/sync-core/test/sync-cancelled-phase-heading.test.js`.
Red: 13 failing, e.g. `TypeError: phaseIsCancelled is not a function` and
`actual: { done: 3, total: 5, current: null }`.

## Fix

- [x] `resolve.js`: add `phaseIsCancelled` (status line wins, else heading ➖);
      `readPhases` drops ➖ from the total; title strip removes ➖
- [x] `phases.js`: `phaseProgress` returns `cancelled` and excludes it from
      `total`; `progressText` appends `, N cancelled`; carried through
      `specstate.js` (`phasesCancelled`) and `inflight.js`
- [x] `nextaction.js`: phases carry `cancelled`; `nextAction` filters them, so
      all-➖ remaining is `/spec-complete` (not idle, not `/spec-next`)
- [x] `resume.js` `blockingNext`, `epic.js` phase waits and `disposition.js`
      treat ➖ as settled; `spec-env disposition` text says "not ✅ or ➖"
- [x] sync-core: `EMOJI_STATUS` gains `➖: 'cancelled'`, every `[⬜🔄✅]` regex
      gains ➖, `PHASE_STATE_BUCKET.cancelled → 'cancelled'`
      (`config.states.cancelled`), status-line words gain cancelled
- [x] Wording: `spec-format.md` defines the four states and the total rule;
      `/spec`, `/spec-review`, `/spec-next`, `/spec-complete` and the README
      list ➖; `docs/reference.html` disposition row
- [x] Failing tests green; `pnpm build && pnpm test` — 4656 pass, 0 fail

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `skitterspec status` / in-flight rows: `N of M phases done, K cancelled` |
| CLI command | update | `epic next` / resume: a ➖ phase is never next or blocking |
| CLI command | update | `spec-env disposition`: ➖ rows are not loose ends |
| Service | update | sync projection: ➖ phase → `states.cancelled`, ➖ stripped from title |
| Skill/rule | update | `spec-format.md`, `/spec`, `/spec-review`, `/spec-next`, `/spec-complete`: ➖ cancelled |

## Changelog

- 2026-11-26 — Bug reproduced; failing tests added (red).
- 2026-11-26 — Decided: ➖ is excluded from the phase total rather than
  counted as done.
- 2026-11-26 — Fixed: ➖ recognised across the engine, sync-core and skill
  wording; tests green.
