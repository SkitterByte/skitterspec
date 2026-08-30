# Phase 1 — `spec-sync init-config` — validate and write ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a command that turns gathered workspace values into a valid
`specs/.core/linear.config.json`, refusing anything the loader would later reject.

## Tasks

- [ ] Add `spec-sync init-config` to `cli-sync.js`: flags for `--team-id`,
      `--team-key`, `--project-id`, `--intake-label`, `--bug-labels`,
      `--hotfix-labels`, `--states <file>` (the workspace's issue-state names),
      and `--json`.
- [ ] Write only the keys the operator actually set. The template carries every
      default; a config that restates them buries the two or three lines that are
      genuinely this repo's, and makes future default changes invisible.
- [ ] Validate before writing, reusing `validateStates` from sync-core so setup
      and push cannot disagree about what a valid state name is. A configured
      name absent from the workspace is a hard failure with the missing names
      listed.
- [ ] Refuse to overwrite an existing `linear.config.json` without `--force`, and
      say which file and what `--force` would do. Re-running setup on a
      configured repo must be safe.
- [ ] Report what was validated (team resolved, N state names checked), so a
      successful run is evidence rather than silence.
- [ ] Add tests: writes a minimal config from a team id alone; omits untouched
      defaults; a state name missing from the workspace fails and names it; an
      existing file is refused without `--force` and replaced with it; `--json`
      emits a machine-readable result. Run `node --test` — green before the phase
      is done.

## Notes

Engine-side on purpose: the skill gathers over MCP, but the file itself is
validated and written by code, so a malformed config can never be the model's
formatting. Mirrors the existing `/spec-push` → `spec-sync apply` split.
