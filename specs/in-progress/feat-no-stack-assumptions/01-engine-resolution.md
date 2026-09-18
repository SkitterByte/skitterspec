---
linear_issue_id: "SKS-350"
---

# Phase 1 — Resolve the engine by a positive-signal ladder ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `init` renders a slash-command invocation that actually resolves, or
says it could not — proven by tests covering all three rungs and the npx blind
spot.

## Tasks

- [x] Replace `detectPackageManager` with `detectRunner(dir)` in
      `packages/common/src/init.js`, returning the runner prefix for the first
      rung that answers: local bin (walk up for `node_modules/.bin/skitterspec`,
      lockfile picks the runner) → `PATH` (bare) → neither (`npx`).
- [x] Filter `_npx` cache directories out of the PATH rung, and write the blind
      spot beside the check as a comment, per `negative-checks.md` rule 2.
- [x] Return the rung alongside the prefix so the caller can warn without
      re-deriving it; keep `renderCommand(content, dir)` pure so
      `managedTargets` still compares against what `installCommands` writes.
- [x] Handle the empty-runner case in the four command assets so rung 2 renders
      `Bash(skitterspec spec-env …:*)` rather than `Bash( skitterspec …:*)` —
      eight `{{exec}}` sites across `assets/commands/*.md`.
- [x] Add a `report.warnings` entry on rung 3 naming the install command and
      that `update` re-renders once the CLI resolves.
- [x] Extend `test/init-commands.test.js`: one test per rung; a stays-silent test
      asserting rungs 1 and 2 warn about nothing; and a test that a PATH entry
      under an `_npx` cache does **not** satisfy rung 2.
- [x] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The existing lockfile-ordering tests still apply to rung 1 and should keep
passing unchanged — the lockfile still picks the runner, it just no longer
decides *whether* the CLI is there.

Rung 2 resolves by looking for the file on `PATH` rather than executing
`skitterspec --version`. Executing it would be the stronger signal, but it runs
the CLI during install and the npx blind spot lands the same way regardless, so
it buys nothing the filter does not.
