# Worktree dependency bootstrap (`setup` step)

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-07-23)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-23
> **Area:** packages/common/src/env/{config,provision}.js, packages/common/src/cli.js, packages/common/assets/{core/env.config.md,core/env.config.json.example,skills/spec-go/SKILL.md}, scripts/build-dist.js output (skitterspec + skitterspec-linear)
> **Stack:** worktree

## Problem

`spec-env up` provisions a worktree with `git worktree add` and, when configured,
brings up Docker and host dev servers — but nothing makes the worktree's
dependencies exist. A fresh worktree shares the git object store yet gets an
empty working tree: no `node_modules`. So husky's `.husky/_/husky.sh` is missing
(every commit is blocked by the hook) and typecheck/build/test can't run. Every
agent that lands in a freshly-provisioned worktree hits this and stalls on
manually installing deps before it can do any real work.

## Decisions

1. **Config-driven `setup` array, not auto-detected.** Add a top-level `setup`
   field to `specs/.core/env.config.json`: an array of shell commands. The tool
   is package-manager-agnostic, so the project declares its own bootstrap (e.g.
   `["pnpm install --frozen-lockfile"]`). Rejected auto-detecting a package
   manager — brittle and surprising across the polyglot projects this targets.
2. **Default `[]` = opt-in.** Absent/empty `setup` is a clean no-op, exactly like
   `dev`. Never changes behaviour for projects that don't configure it.
3. **Normalised like `dev`.** Lenient array-of-strings handling in
   `config.js`: trim each entry, drop empties/non-strings, so a stray value can't
   crash provisioning. Mirrors `normalizeDev`.
4. **Runs automatically during `spec-env up`, not confirm-gated.** The worktree
   is unusable without deps, and `pnpm install` is fast via hard-links — so setup
   is part of provisioning, unlike the "confirm-first" heavy dev servers.
5. **Emitted by `planUp`, in the worktree, after `git worktree add`, before
   Docker/dev.** `planUp` stays pure and just adds the commands to the plan it
   already returns; the CLI prints them under a labelled **"in the worktree,
   run:"** group — matching the existing `write .env in the worktree:` idiom, so
   the agent knows the cwd is the worktree.
6. **Token expansion, same tokens as `dev`/`open`.** Each setup command is
   expanded via `expandTokens` with `{slug}`, `{branch}`, `{worktreePath}`,
   `{projectName}`, `{portOffset}` for consistency (near-zero cost; setup runs
   cd'd into the worktree so `{worktreePath}` is usually redundant but available).
7. **Always emit on re-attach.** Setup is emitted on every provision, fresh or
   re-attached. `pnpm install` is idempotent and cheap, and re-emitting catches
   lockfile drift on the branch since the last run.
8. **Applies to every stack.** Deps are needed regardless of Docker — setup is
   emitted for both worktree-only and `worktree + docker` specs.
9. **Source of truth is `packages/common/src/env/`.** The `skitterspec` and
   `skitterspec-linear` distributions are rebuilt from it via
   `scripts/build-dist.js`; no hand-edits to built output.

## Solution overview

Config gains one field:

```jsonc
// specs/.core/env.config.json
"setup": ["pnpm install --frozen-lockfile"]   // default [] — opt-in
```

`config.js` normalises it (new `normalizeSetup`, applied when `parsed.setup` is
an array). `planUp` expands each command's tokens and appends the results to a
new `setupCommands` field on the plan (and keeps them out of the existing
`commands` list, which the agent runs from the primary checkout root). The CLI
prints them under a `in the worktree, run:` heading, between the `run these:`
block and the `.env` block. `spec-go`'s SKILL notes that provisioning bootstraps
deps. Docs (`env.config.md`) and the `.json.example` gain the field; the two dist
packages are rebuilt.

Printed plan (worktree-only spec with setup configured):

```
  run these:
    git worktree add ../repo-wt/feat-x -b feat/feat-x

  in the worktree, run:
    pnpm install --frozen-lockfile
```

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine — normalise `setup`, emit from `planUp`, print in CLI | ✅ | [01-engine.md](01-engine.md) |
| 2 | Surface — docs, example config, spec-go SKILL, rebuild dist | ⬜ | [02-surface.md](02-surface.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-23 | Ready | backlog | Reuben Greaves |
| 2026-07-23 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-23 — Spec created.
