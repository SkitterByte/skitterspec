---
github_identifier: "#266"
github_url: "https://github.com/SkitterByte/skitterspec/issues/266"
---

# Uninstall a local install

> **Type:** Feature
> **Name:** feat-uninstall-local
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/266
> **Author:** Reuben Greaves
> **Raised:** 2026-11-20
> **Area:** packages/common/src/init.js, packages/common/src/cli.js, packages/common/src/env/hooks.js, docs
> **Stack:** worktree
> **Docs:** index, reference, azure-boards, github, jira, linear

## Summary

`skitterspec uninstall` takes a local install (`init --local`) back off a
machine exactly: the skills, commands, rules and hooks go, along with the
CLAUDE block and the git excludes, and the committed `specs/` stays as it is.
Claude stops picking up the spec commands in that repo.

## Problem

`init --local` lets one developer use skitterspec on a shared repo without
committing it, but there is no way back. Turning it off means finding every
path in the `.git/info/exclude` block, deleting the right ones, and hand-editing
two files that also hold the developer's own settings
(`.claude/settings.local.json`, `CLAUDE.local.md`). A colleague on LSC wants to
stop after their current work, and doing that by hand is easy to get wrong:
a hook left behind keeps refusing writes on `main` after the skills that
explain it are gone.

## Acceptance criteria

- `skitterspec uninstall` on a local install prints what it would remove and changes nothing.
- `skitterspec uninstall --yes` removes every managed file that still matches the manifest, our hooks from `.claude/settings.local.json`, the marked block from `CLAUDE.local.md`, the manifest, `.spec-env/` and the exclude block.
- Afterwards no `/spec*` skill or command is left in `.claude/`, and a write on `main` is no longer refused.
- A managed file the developer edited is kept and listed, never deleted.
- Other settings and other text in `settings.local.json` and `CLAUDE.local.md` are untouched; a file left empty by the removal is deleted.
- Nothing under `specs/` is touched, and `git status` is unchanged by the run.
- With a spec or specless branch still provisioned, or the live overlay held, it refuses, names each one, and changes nothing.
- On a team install (committed) it refuses and says why.

## Decisions

1. **A top-level `uninstall` verb**, not `init --uninstall`: `init` doing a
   removal reads backwards. It plans by default and acts only with `--yes`,
   matching `init --reset`.
2. **Local installs only.** A team install is committed shared policy;
   removing it is a commit for the team to make, not one machine's command.
   It refuses and says so. Converting local → team (`init --team`) is a
   separate gap and not this spec.
3. **Edited files are kept and reported.** Only a file whose hash matches the
   manifest is deleted. An unrecognised hash is cannot-tell (a user's edit, or
   a lost manifest), so it takes the harmless branch
   (`.claude/rules/negative-checks.md` rule 4). No `--force`: the list names
   the files, and deleting them by hand is the deliberate act.
4. **Refuse while anything is in flight.** Each worktree carries a seeded copy
   of the install (`localSeedFiles`), so its skills would break mid-work, and
   a torn-down primary leaves nothing to run `/spec-complete` with. The
   positive signal is the provisioned registry and the live lock; each is
   named with its exit (`/spec-complete`, `/spec-cancel`, `spec-env down`,
   `/spec-live main`). Nothing changes until they are gone.
5. **Only our hooks leave `settings.local.json`.** Reuse `removeHooks`, made
   to take `{ local }` as `ensureHooks` already does. A malformed file is
   reported and left alone, never rewritten.
6. **The global npm package is not ours to remove.** The report's last line
   names `npm uninstall -g <distribution>`.

## Solution overview

`uninstall({ dir, yes })` in `init.js`:

1. Read the manifest. No manifest → nothing to uninstall (exit 0, says so).
   `scope` is not `local` → refuse (decision 2).
2. Read the registry and live lock; any entry → refuse naming each (decision 4).
3. Plan: for each manifest file, `managedState` → `remove` (pristine) or
   `keep` (customized); the hooks to drop; the CLAUDE.local.md block; the
   manifest, `.spec-env/`, the exclude block.
4. Without `--yes`, print the plan. With it, act in this order: files (each
   through `assertSafeToDelete`), empty skill/hook folders, hooks, CLAUDE
   block, exclude block, `.spec-env/`, manifest last — so a run that fails
   part-way can be re-run.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec uninstall [--yes]` |
| Service | add | `uninstall()` in `init.js` |
| Service | update | `removeHooks(dir, { local })`; CLAUDE block strip takes a target file |
| Docs | update | index, reference, provider pages: the way back from `init --local` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine and CLI verb, with tests | ⬜ | [01-engine.md](01-engine.md) |
| 2 | Docs | ⬜ | [02-docs.md](02-docs.md) |

## Open questions

- [ ] None

## Changelog

- 2026-11-20 — Spec created.
