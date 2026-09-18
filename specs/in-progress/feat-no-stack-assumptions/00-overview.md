---
linear_identifier: "SKS-349"
linear_url: "https://linear.app/skitterbyte/issue/SKS-349/no-assumptions-about-the-host-projects-stack"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# No assumptions about the host project's stack

> **Type:** Feature
> **Name:** feat-no-stack-assumptions (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-18)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** packages/common/src/init.js, packages/common/assets/commands/, packages/common/src/env/provision.js, packages/common/src/env/teardown.js, packages/common/assets/rules/
> **Stack:** worktree

## Problem

Skitterspec is meant to know nothing about what the projects it installs into are
written in, and an audit found it very nearly holds: the engine shells out to
`git` and (optionally, non-fatally) `docker` and nothing else, no framework or
language name appears anywhere in the shipped skills, rules or hooks, and every
project-specific hook in `env.config.json` is empty by default.

Four things break that. The load-bearing one is the install lane: the four slash
commands are rendered from a **lockfile guess**, so a project with no JS lockfile
gets `npx skitterspec …` baked into `.claude/commands/*.md` — and the unscoped
name `skitterspec` does not exist on npm, so all four 404 unless the CLI happens
to be installed. In a Node repo you never notice, because you added the
devDependency. In a C# repo that is the default outcome of following the README.
The other three are smaller: a spec with no `Stack:` header inherits
`docker.enabled`, `docker.composeFile` is read and never used, and the
fill-in documentation is written in npm.

## Decisions

1. **Resolve the engine by a positive-signal ladder at install time**, replacing
   the lockfile guess. A lockfile answers "which runner would I use *if* the CLI
   were installed here", which is not the question — `detectPackageManager` is
   inferring from an absence, which is what `negative-checks.md` rule 1 exists to
   stop. The ladder asserts something present at each rung and only falls through
   when it genuinely cannot tell.
2. **Project-visible signals outrank machine-visible ones** — the lockfile rung
   is checked before the PATH rung. `.claude/commands/*.md` is committed, and
   `renderCommand` also feeds `managedTargets`, so a render that varies by machine
   makes the file flip between pristine and updatable as different people run
   `update`. A lockfile is committed and answers the same everywhere; PATH is one
   machine's business. The churn risk therefore survives only in a repo with no
   lockfile where some developers have a global install and others do not — and
   there the `npx` fallback would 404 for the have-nots anyway, so the churn is
   surfacing a real disagreement rather than manufacturing one.
3. **The PATH rung ignores npx cache directories.** Verified rather than assumed:
   `npx` prepends its `_npx/<hash>/node_modules/.bin` to `PATH` for child
   processes. So probing for `skitterspec` while running under
   `npx @skitterbyte/skitterspec init` finds a binary that exists only for the
   duration of that run — and bakes a bare `skitterspec …` into four committed
   files that die the moment it ends.
   This is the blind spot the check must name beside itself (rule 2).
4. **When nothing resolves, render `npx` as today and warn.** Rejected: refusing
   the install. `init` has real work to do either way — skills, rules, folders,
   scaffolding — and none of it depends on the CLI being reachable later. A
   warning naming the install command is the honest cannot-tell branch (rule 4);
   a refusal would trade a working install for a broken one.
5. **Rejected: a run-time shim** (`.claude/skitterspec-engine.cjs` invoked by
   each command, resolving the way the hooks already do). It is strictly more
   robust — it survives the project changing shape after install — but it adds an
   installed file to manage and turns every `allowed-tools` matcher into a node
   invocation, and install-time resolution with a warning covers the failure that
   actually happens.
6. **Rejected: widening the `npx` fallback to the scoped name.** Two lines, and
   wrong in three ways: a registry round-trip on every command, a version that
   drifts from whatever `init` wrote the rest of the install with, and still no
   word to the user that the CLI is not installed.
7. **A spec with no Stack header inherits `docker.enabled` only when the
   configured compose file exists.** Rejected: falling back to `worktree`
   unconditionally. It is the tidier reading of rule 4, but the unknown case is
   not symmetric — in a project that genuinely uses Docker, a legacy no-header
   spec would silently stop getting its stack and the failure would surface as
   tests failing for a reason nobody connects back to this. Requiring the compose
   file is a positive signal that keeps every real Docker project working and
   only withholds the stack where there was no stack to bring up.
8. **`docker.composeFile` becomes load-bearing.** It is read, normalised and
   validated today and then never passed to `docker compose` in either direction,
   so a project that names its file anything else has its configuration silently
   ignored and is relying on docker's own discovery. Decision 7 is the first thing
   that actually reads the key, which makes fixing it a precondition rather than
   an adjacent tidy-up.

## Solution overview

**The ladder** (`init.js`, replacing `detectPackageManager`):

1. `node_modules/.bin/skitterspec` exists, walking up from the target dir — a
   local install. The lockfile picks the runner (`pnpm exec` · `yarn` · `npx`),
   which is what the current function already does well.
2. `skitterspec` resolves on `PATH`, ignoring any entry under an `_npx` cache —
   a global install. Renders bare, so the command is `skitterspec spec-env …`.
3. Neither — render `npx` as today, and add a warning to the init report naming
   what to install and that `update` re-renders once it is.

`renderCommand` stays a pure function of `(content, dir)` so `managedTargets` can
keep comparing against exactly what `installCommands` would write.

**The commands** carry `{{exec}}` in two places each (the `allowed-tools` matcher
and the `!` line), eight across the four files. Rung 2 renders an empty runner, so
the placeholder and its trailing space collapse together rather than leaving
`Bash( skitterspec …)`.

**Docker** (`provision.js`, `teardown.js`): the no-header fallback gains the
compose-file check, and both `docker compose` lines gain `-f <composeFile>`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Install lane | update | `detectPackageManager` → `detectRunner` ladder |
| Init report | add | warning when no engine resolves |
| Command files | update | 4 files, 8 `{{exec}}` sites, empty-runner case |
| Provision plan | update | no-`Stack` docker fallback gated on compose file |
| Provision / teardown | update | `docker compose -f <composeFile>` both ways |
| Config key | update | `docker.composeFile` now read |
| Rules / docs | update | `spec-planning.md`, `spec-reports.md`, `env.config.md`, README |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Resolve the engine by a positive-signal ladder | ✅ | [01-engine-resolution.md](01-engine-resolution.md) |
| 2 | Honour the docker config instead of assuming it | ✅ | [02-docker-config.md](02-docker-config.md) |
| 3 | Stop writing the docs in npm | ✅ | [03-docs-defaults.md](03-docs-defaults.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | Ready | backlog | Reuben Greaves |
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-18 — Spec created.
- 2026-09-18 — Phase 3: the four worked examples in `spec-reports.md` were
  **varied across stacks** rather than turned into placeholders. They exist to
  show a filled-in report, and `<the project's test command>` makes them less
  concrete, not more neutral. `test_orders.py` replaced `orders.test.js` in the
  failure example so the filename and the runner agree.
- 2026-09-18 — Phase 3: `env-supervise.test.js` failed once under full-suite
  load (5164ms against 212ms in isolation) and passed on every re-run, in both
  trees. It spawns a real process and polls it, so it is load-sensitive;
  recorded rather than chased, since nothing in this spec touches it.
- 2026-09-18 — Phase 2: the stack decision existed in **three** copies —
  `provision.js`, `teardown.js` and `cli.js` — and two of them disagreed. The
  CLI read `spec.stack === 'docker'` with no fallback, so a header-less spec
  allocated no registry slot while the planner emitted `docker compose up -d`
  anyway, on a port offset derived from a slot that was never allocated.
  Extracted to one exported `resolveStack`, which both now call. Not in the
  spec's task list; found while implementing it.
- 2026-09-18 — Phase 2: `-f` is passed **only when the compose file is found**,
  not unconditionally. Always passing it would fix a project naming a custom
  file and break the mirror image — one whose file is `compose.yaml` (a name
  docker discovers itself) while the key sits at its default.
- 2026-09-18 — Phase 2: teardown is deliberately **not** gated on the compose
  file, where provisioning is. Skipping a `down` orphans a running stack and
  its volumes, so the harmless branch points the other way there.
- 2026-09-18 — Phase 1: `detectPackageManager` was **kept**, not replaced. It
  answers rung 1's "which runner reaches a local install", which is still a
  real question — `detectRunner` is the ladder layered over it. Replacing it
  outright would have deleted a tested function to rename it.
- 2026-09-18 — Phase 1: the empty-runner case is handled in `renderCommand`,
  which consumes `{{exec}}` **with its trailing space**, rather than by editing
  the four command assets. One place instead of eight, and the templates stay
  readable.
- 2026-09-18 — Phase 1: the install-lane tests now seed a
  `node_modules/.bin/skitterspec` before asserting a lockfile runner. Under the
  ladder a lockfile alone no longer implies an install, so those tests were
  asserting the old premise; the spec expected them to pass unchanged.
- 2026-09-18 — Audit established empirically, before deciding the shape: `npx`
  resolves a globally installed package but not an arbitrary `PATH` binary; the
  unscoped name `skitterspec` 404s on npm; `npx` prepends its cache bin directory
  to `PATH` for child processes.
