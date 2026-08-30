# Phase 1 — `spec-sync init-config` — validate and write ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a command that turns gathered workspace values into a valid
`specs/.core/linear.config.json`, refusing anything the loader would later reject.

## Tasks

- [x] Add `spec-sync init-config` to `cli-sync.js`: flags for `--team-id`,
      `--team-key`, `--project-id`, `--intake-label`, `--bug-labels`,
      `--hotfix-labels`, `--states <file>` (the workspace's issue-state names),
      and `--json`.
- [x] Write only the keys the operator actually set. The template carries every
      default; a config that restates them buries the two or three lines that are
      genuinely this repo's, and makes future default changes invisible.
- [x] Validate before writing, reusing `validateStates` from sync-core so setup
      and push cannot disagree about what a valid state name is. A configured
      name absent from the workspace is a hard failure with the missing names
      listed.
- [x] Refuse to overwrite an existing `linear.config.json` without `--force`, and
      say which file and what `--force` would do. Re-running setup on a
      configured repo must be safe.
- [x] Report what was validated (team resolved, N state names checked), so a
      successful run is evidence rather than silence.
- [x] Add tests: writes a minimal config from a team id alone; omits untouched
      defaults; a state name missing from the workspace fails and names it; an
      existing file is refused without `--force` and replaced with it; `--json`
      emits a machine-readable result. Run `node --test` — green before the phase
      is done.
- [x] Add `--state <bucket>=<name>` (repeatable) so a workspace that renamed a
      state can be *configured*, not just diagnosed. Not in the original flag
      list: without it validation could only ever refuse, and the fix meant
      hand-editing the file the command exists to write.
- [x] Dispatch `init-config` **before** `loadLinearConfig`. Every other
      subcommand exits early on `present:false`, so setup had to run ahead of the
      load — and `--force` must be able to replace a config too malformed for the
      loader to parse.

## Notes

Engine-side on purpose: the skill gathers over MCP, but the file itself is
validated and written by code, so a malformed config can never be the model's
formatting. Mirrors the existing `/spec-push` → `spec-sync apply` split.

`--states` is **optional**, unlike `push`'s `--workspace-states`. It has to be:
`spec-sync states` cannot run before a config exists, so requiring discovered
state names here would leave the config unbootstrappable. The skill always passes
them; a bare CLI run without them writes and says loudly that the names are
unverified.
