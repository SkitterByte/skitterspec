# Phase 3 — `init` isolation opt-in prompt writes env.config.json ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Adopting per-spec isolation becomes a one-question opt-in at
`npx skitterspec init` — on yes, `init` writes an activated
`specs/.core/env.config.json` (not just the `.example` template), so `/spec-go`
provisions worktrees from then on. Declining leaves the project unchanged.
Proven by init tests over the enabled/disabled paths.

## Tasks

- [ ] Add an `installIsolation(dir, { enabled }, opts)` in `src/init.js`: when
      `enabled`, write `specs/.core/env.config.json` from the
      `env.config.json.example` asset (activated config); when not, keep today's
      behaviour (templates only, via `installCore`). Idempotent — never clobber an
      existing `env.config.json` without `--force`.
- [ ] Thread an `isolation` boolean through `init(...)` alongside `release`
      (default off for `--yes`/non-interactive unless the flag is set); call
      `installIsolation` from `init()`.
- [ ] Add CLI plumbing in `src/cli.js` mirroring the release-tooling flags: an
      interactive `prompts` question ("Enable per-spec isolation — a git worktree
      per spec?") and `--isolation` / `--no-isolation` flags to drive it
      non-interactively.
- [ ] Update `printReport`'s closing "Next" note: when isolation was enabled, say
      worktrees are now automatic at `/spec-go` (and Docker is a per-spec `Stack`
      escalation); when not, keep the current "copy the example to enable" line.
- [ ] Add/extend init tests: enabling writes `specs/.core/env.config.json`;
      declining does not; re-running is idempotent; `--force` refreshes. Run
      `npm test` + typecheck — green before done.

## Notes

- `update` mode must **not** write/activate `env.config.json` (same guard as
  release config — `mode !== 'update'`), so re-syncing skills never silently
  turns isolation on.
- Enabling only writes the config; the actual worktree provisioning is the
  `/spec-go` wiring in Phase 4.
