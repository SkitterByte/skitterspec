# Phase 1 — The offline checks, as a pure report ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a pure function turns the state of a project into a list of checks,
each with a state and the command that fixes it — no IO, no network, no output.

## Tasks

- [x] Add `packages/linear/src/doctor.js` with `runChecks(state)` returning
      `{ ok, checks: [{ id, label, state, detail, fix }] }`, where `state` is
      `ok` · `missing` · `broken` · `skipped`.
- [x] Distinguish **missing** (an opt-in not taken — fine) from **broken**
      (configured but wrong — not fine). `ok` is true only when nothing is
      `broken`, so declining an opt-in never reads as a failure.
- [x] Cover the four layers: scaffold (`specs/` folders + skills present),
      isolation (`env.config.json` parses), tracker (`linear.config.json` parses
      and carries a `teamId`), key (present, with source).
- [x] Take the project's state as an **argument**, gathered by the caller — keep
      this module free of `fs` so every branch is testable from a literal.
- [x] Give each non-`ok` row a `fix` naming the exact command.
- [x] Add `packages/linear/test/doctor.test.js` over literals: all-ok; each layer
      missing in turn; a malformed config reported `broken`, not `missing`; a
      declined opt-in keeps `ok: true`; every non-ok row carries a `fix`.
- [x] Add a `skipped` state alongside the three planned: the key row when no
      tracker is configured (nothing to authenticate against) and the remote row
      until `--check-remote` is passed. Neither is a problem to report.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

Pure and offline, so the whole matrix is exercised from literals rather than by
constructing a dozen scaffolded temp projects. Phase 2 supplies the real state.
