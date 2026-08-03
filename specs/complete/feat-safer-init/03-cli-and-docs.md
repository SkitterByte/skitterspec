# Phase 3 — CLI detection, prompt, flags + /spec-init docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `init` on an existing setup routes to resync / reset / leave (interactive
prompt or flags), the non-interactive default stays create-missing, and the
behaviour is documented — proven by CLI-parse + integration tests.

## Tasks

- [x] `cli.js` parse: added `--resync` / `--reset`; kept `--force`/`--yes`/
      `--isolation` and the `update` command. `HELP` refreshed.
- [x] `init` dispatch: on `isExistingSetup` → interactive 3-way prompt (default
      Leave alone; Start-again second confirm); `--resync`→resync, `--reset`→reset
      (refused without `--yes`), `--force`→resync-overwrite; non-interactive with
      no flag → create-missing. Fresh repo unchanged. Isolation prompt now only on
      a fresh repo.
- [x] `update` → `resync` (keeps customized; `--force` to overwrite); release-tool
      cleanup kept.
- [x] `promptExistingSetup()` in `prompts.js` (select + reset confirm).
- [x] `/spec-init` SKILL.md documents the safe re-run (manifest + resync/reset/
      leave). Dists rebuilt.
- [x] Tests (5): parse flags; `--reset` refused without `--yes`; non-interactive
      existing → create-missing; `update` resyncs keeping edits; `--resync`
      recreates missing + keeps customized. Suite 297 green. Live-smoked the CLI.

## Notes

Prompts must be non-blocking in CI (no TTY) — mirror the existing `promptSetup`
gating (`process.stdin.isTTY && !opts.yes`). Default the interactive choice to the
safest (Leave alone) so an accidental `init` + Enter changes nothing.
