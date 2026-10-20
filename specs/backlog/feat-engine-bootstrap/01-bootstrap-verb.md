---
linear_issue_id: "SKS-396"
---

# Phase 1 — `bootstrap` engine and verb ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env bootstrap <spec>` brings a provisioned worktree to ready in
one call, proven by tests against a temp repo with an injected spawn.

## Tasks

- [ ] Make `planUp`'s worktree steps data alongside the strings:
      `{ kind: 'seed', file, mode }`, `{ kind: 'envFile', file, projectName, offset }`,
      `{ kind: 'setup', command }`, `{ kind: 'docker', argv }` (strings stay
      until phase 2)
- [ ] Add `packages/common/src/env/bootstrap.js` — `runBootstrap(steps, { cwd, mainRoot, fs, spawn, out })`:
  - [ ] seed: missing source → `not in main — skipped`; existing target (file
        or link) → `exists — skipped`; else `mkdir -p` + symlink/copy → `seeded …`
  - [ ] envFile: refuse a symlink before touching it; touch; fix a missing
        trailing newline; append `COMPOSE_PROJECT_NAME` / `PORT_OFFSET` only
        when no line sets them
  - [ ] setup / docker: spawn with `cwd`, inherited stdio; non-zero → stop,
        return the failing step
- [ ] Add the CLI verb `spec-env bootstrap [<spec>] [--docs] [--plan] [--json]`:
      resolve (spec or specless), refuse when the worktree is absent or a docker
      spec has no slot (naming `spec-env up <name>`), resolve the main checkout
      root, run; exit non-zero naming the failed step
- [ ] `--plan` prints step descriptions only; `--json` prints steps + outcomes
- [ ] Add to `spec-env` help/verb list (`cli-help-verbs.test.js`)
- [ ] Tests (`env-bootstrap.test.js`, `cli-spec-env-bootstrap.test.js`):
  - [ ] fresh worktree: seeds, envFile, setup, docker all run from one call
  - [ ] second run changes nothing (no file writes, same skipped lines)
  - [ ] a seed missing in main is skipped and the run still succeeds
  - [ ] a symlinked envFile is refused and nothing is appended
  - [ ] a failing setup stops before docker and names the step
  - [ ] `--docs` runs seeds only
  - [ ] stays silent: no worktree → refusal, nothing written
- [ ] Run `pnpm test` — green before the phase is done

## Notes

Port the `bug-compose-before-env` behaviour and its tests (`env-seed.test.js`)
over to the Node path rather than rewriting them, so the edge cases those tests
already pin carry across.
