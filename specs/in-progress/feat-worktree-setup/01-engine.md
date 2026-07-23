# Phase 1 — Engine: normalise `setup`, emit from `planUp`, print in CLI ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env up` emits the configured `setup` commands as a
worktree-scoped block, expanded per-token, for every stack and on re-attach —
proven by unit tests over `config.js`, `provision.js`, and the CLI output.

## Tasks

- [ ] **config.js** — add `setup: []` to `DEFAULT_CONFIG` and to `defaults()`.
      Add a `normalizeSetup(parsed)` helper mirroring `normalizeDev`: keep only
      trimmed, non-empty string entries; drop everything else. In `mergeConfig`,
      when `Array.isArray(parsed.setup)`, set `base.setup = normalizeSetup(...)`.
      Update the shape doc comment at the top of the file.
- [ ] **provision.js** — in `planUp`, expand each `config.setup` command via
      `expandTokens` (import from `./resolve.js`) with tokens `{slug}`,
      `{branch}`, `{worktreePath}`, `{projectName}`, `{portOffset}` (use the same
      `offset` value already computed; `''` when null). Return them on a new
      `setupCommands` field of the plan. Keep them **out** of `commands` (which
      runs from the primary checkout root). Emit for every stack and regardless
      of `attached`. Update the `@returns` doc.
- [ ] **cli.js** — in `specEnvUp`, after the `run these:` block and before the
      `.env` block, print a `in the worktree, run:` heading listing
      `plan.setupCommands` (skip the heading entirely when the list is empty).
- [ ] **Tests** — extend `test/env-config.test.js` (setup normalisation:
      defaults to `[]`, trims, drops non-strings/empties, forward-compat on
      absent), `test/env-provision.test.js` (setupCommands expanded with tokens;
      empty when unconfigured; present on both stacks and when `attached`), and
      `test/cli-spec-env-up.test.js` (heading printed with commands / omitted
      when none). Run `node --test` (see `.claude/rules/spec-planning.md`) —
      green before the phase is done.

## Notes

`expandTokens` is already used by `planDev` (`dev.js`) and lives in
`resolve.js` — reuse it, don't reimplement. `planUp` currently imports only
`portOffset` and the render helpers; add the `resolve.js` import.
