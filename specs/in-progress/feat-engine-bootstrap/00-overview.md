---
linear_identifier: "SKS-395"
linear_url: "https://linear.app/skitterbyte/issue/SKS-395/engine-run-worktree-bootstrap"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Engine-run worktree bootstrap

> **Type:** Feature
> **Name:** feat-engine-bootstrap (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-10-20)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-20
> **Area:** packages/common/src/env/provision.js, packages/common/src/env/bootstrap.js (new), packages/common/src/cli.js, packages/common/assets/skills/{spec,spec-start,spec-bug,spec-hotfix,no-spec}/SKILL.md, specs/.core/env.config.md
> **Stack:** worktree

## Problem

`spec-env up` (and `spec-env nospec`) print the worktree's bootstrap as shell
commands for the agent to run: seed the gitignored files, write
`docker.envFile`, run `setup`, bring up the stack. Consumer repos run a
`protect-secrets` PreToolUse hook that refuses any Bash call naming a `.env`
file, and it lets through only commands shaped exactly like the ones
`seedCommandFor` prints. Agents don't copy those commands word for word. On skitterload
`feat-guided-routines` (skitterspec 17.4.0) the agent merged the two seeds into
a `for f in packages/api/.env apps/web/.env; …` loop, rewrote the echo text and
put setup and docker in one call. The hook blocked it, and auto mode then
refused the agent's own retry of the `.worktree.env` write as a workaround.
Bootstrap stopped and the user ran everything by hand. It is the second time.
Any plan that depends on an agent reproducing shell exactly fails this way, so
the fix is to stop printing the shell, not to make the hook more lenient.

## Decisions

1. **New verb `spec-env bootstrap [<spec>] [--docs] [--plan] [--json]`** runs
   the worktree steps itself. `up` stays a planner (fork + spec commit). Rejected:
   `up --apply` — it makes `up` side-effecting and couples re-running one step
   (setup after a lockfile change) to re-planning the fork.
2. **Seeds and the env file run in Node `fs`**, never a shell. Setup and docker
   are spawned with `cwd` = the worktree and inherited stdio, so install output
   streams. Rejected: `sh -c` over the existing strings — it keeps runnable `.env`
   shell in the plan, which is the thing agents rewrite.
3. **The agent's call carries no `.env` text**:
   `skitterspec spec-env bootstrap <name>`. There is nothing for a secrets hook
   or auto mode to object to, and nothing to rewrite.
4. **`up` and `nospec` print one line in place of the step list.** Under
   `then, run:`, they print `skitterspec spec-env bootstrap <name>` (with
   `--docs` when planned so). `bootstrap --plan` describes the steps in words
   (`seed packages/api/.env (symlink)`, `setup: pnpm install …`) for a human
   reader, and does not print shell. `seedCommandFor` and `envFileCommandFor`
   are removed, so there is one implementation.
5. **Same behaviour as today, kept exactly:** order seeds → env file → setup →
   docker; idempotent; per-step `seeded …` / `exists — skipped` /
   `not in main — skipped` lines; a missing seed source is skipped, not a
   failure; a symlinked envFile is refused, loudly and before anything is
   appended; stop at the first failing step, exit non-zero, name the step.
6. **Refuse before acting when `up` has not run.** Refuse if the worktree path
   does not exist, or if a docker spec has no registry slot. The refusal names
   `spec-env up <name>`. `--docs` skips setup and docker, as `planUp` does today.
7. **Specless work is covered.** `bootstrap` resolves `/no-spec` names (resolve
   already does), runs `setup` only (nospec seeds nothing today; unchanged), and
   `/no-spec` calls it.
8. **Out of scope, on purpose:**
   - main-guard checks `payload.cwd` instead of the write's `file_path`, so it
     refuses writes outside the repo (the scratchpad). That is a separate
     `/spec-bug`.
   - `protect-secrets.cjs` is skitterload's own hook. Skitterspec does not ship
     it and no manifest tracks it, so `skitterspec update` cannot drop its
     `VALUE_FREE`/`SYMLINK` exception. Tightening it is a skitterload change, to
     make once a release with `bootstrap` is installed there.
9. **A breaking change for anyone running the printed list.** `up`'s output
   loses its `then, in the worktree, run:` block. The skills are its only
   consumers, and all of them switch in phase 3. The release is a major bump.

## Solution overview

`provision.js` keeps `planUp` as the source of the step list, but the steps
become data (`{ kind: 'seed'|'envFile'|'setup'|'docker', … }`) rather than
strings. A new `bootstrap.js` runs that list with an injected fs/spawn, so it is
unit-testable without git or docker. The CLI verb resolves the spec, re-plans
with the registry's existing slot, and executes. `--plan` renders the
descriptions and `--json` emits the step list plus per-step outcomes.

```
spec-env bootstrap feat-x
  seeded packages/api/.env → /…/repo/packages/api/.env
  seed apps/web/.env: not in main — skipped
  env file .worktree.env: ready
  setup: pnpm install --frozen-lockfile        (streams)
  docker: compose up -d                        (streams)
spec-env bootstrap: feat-x ready (4 steps)
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env bootstrap [<spec>] [--docs] [--plan] [--json]` |
| CLI command | update | `spec-env up`: worktree step list → one `bootstrap` line |
| CLI command | update | `spec-env nospec`: setup list → one `bootstrap` line |
| Service | add | `env/bootstrap.js` — `runBootstrap(steps, io)` |
| Service | update | `planUp` steps as data; remove `seedCommandFor`, `envFileCommandFor` |
| Skill/rule | update | `/spec`, `/spec-start`, `/spec-bug`, `/spec-hotfix`, `/no-spec` call `bootstrap` |
| Config key | update | `env.config.md` — `seedFiles`, `docker.envFile`, `setup` now run by `bootstrap` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `bootstrap` engine and verb | ✅ | [01-bootstrap-verb.md](01-bootstrap-verb.md) |
| 2 | `up` / `nospec` print the verb, not the shell | ⬜ | [02-planner-output.md](02-planner-output.md) |
| 3 | Skills call `bootstrap`; docs | ⬜ | [03-skills-and-docs.md](03-skills-and-docs.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-20 | Ready | backlog | Reuben Greaves |
| 2026-10-20 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-20 — Spec created.
- 2026-10-20 — Follow-up surfaced: main-guard judges `payload.cwd`, not the
  write's `file_path`, so it refuses writes outside the repo; to be its own
  `/spec-bug`.
- 2026-10-20 — Follow-up surfaced: skitterload's `protect-secrets.cjs`
  can drop its `VALUE_FREE`/`SYMLINK` exception once it runs a skitterspec
  with `bootstrap`; skitterload-side, not shipped by skitterspec.
- 2026-10-20 — Phase 1: the docker step is an argv run without a shell;
  `setup` stays a shell string (the project's own command line). The verb
  lists in `env.config.md`, `spec-planning.md` and `docs/reference.html` took
  `bootstrap` now rather than in phase 3 — the verb-list tests require every
  dispatched verb to be documented the moment it exists.
