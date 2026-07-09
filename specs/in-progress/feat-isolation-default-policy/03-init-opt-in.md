# Phase 3 — `init` isolation opt-in prompt writes env.config.json ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Adopting per-spec isolation becomes a one-question opt-in at
`npx skitterspec init` — on yes, `init` writes an activated
`specs/.core/env.config.json` (not just the `.example` template), so `/spec-go`
provisions worktrees from then on. Declining leaves the project unchanged.
Proven by init tests over the enabled/disabled paths.

## Tasks

- [x] Add an `installIsolation(dir, { enabled }, opts)` in `src/init.js`: when
      `enabled`, write `specs/.core/env.config.json` from the
      `env.config.json.example` asset (activated config); when not, keep today's
      behaviour (templates only, via `installCore`). Idempotent — never clobber an
      existing `env.config.json` without `--force` (via `writeFile`).
- [x] Thread an `isolation` boolean through `init(...)` alongside `release`
      (default off for `--yes`/non-interactive unless the flag is set); call
      `installIsolation` from `init()` (guarded by `mode !== 'update'`).
- [x] Add CLI plumbing in `src/cli.js` mirroring the release-tooling flags: an
      interactive `prompts` question ("Enable per-spec isolation — a git worktree
      per spec?") and `--isolation` / `--no-isolation` flags to drive it
      non-interactively. `promptSetup` now returns `{ release, isolation }`.
- [x] Update `printReport`'s closing "Next" note: keyed off whether
      `env.config.json` exists on disk — ON message (worktrees automatic at
      `/spec-go`, Docker a per-spec `Stack` escalation) vs the opt-in line.
- [x] Add/extend init tests: `--isolation` activates the live config (a copy of
      the example); declining does not; `update` never activates; idempotent +
      `--force` refreshes; `parse` reads the flags. Ran `npm test` — 128/128 green
      + CLI smoke on both paths.

## Notes

- `update` mode must **not** write/activate `env.config.json` (same guard as
  release config — `mode !== 'update'`), so re-syncing skills never silently
  turns isolation on.
- Enabling only writes the config; the actual worktree provisioning is the
  `/spec-go` wiring in Phase 4.
