---
github_identifier: "#266"
github_url: "https://github.com/SkitterByte/skitterspec/issues/266"
---

# Uninstall, disable and enable a local install

> **Type:** Feature
> **Name:** feat-uninstall-local
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/266
> **Author:** Reuben Greaves
> **Raised:** 2026-11-20
> **Area:** packages/common/src/init.js, packages/common/src/cli.js, packages/common/src/env/hooks.js, docs
> **Stack:** worktree
> **Docs:** index, reference, azure-boards, github, jira, linear

## Summary

Three verbs for a local install (`init --local`). `skitterspec disable` tells
this machine's Claude to stop using the skills, commands, rules and hooks while
the files stay on disk; `skitterspec enable` turns them back on, installing them
first when they are not there. `skitterspec uninstall` disables and then removes
the files, the git excludes and the manifest. The committed `specs/` is never
touched.

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

- `skitterspec disable` on a local install leaves every managed file on disk, and afterwards Claude offers no skitterspec skill or command, loads none of its rules or the CLAUDE.local.md block, and a write on `main` is no longer refused.
- `skitterspec enable` reverses exactly what `disable` wrote, leaving the developer's own settings as they were, and Claude uses the install again.
- `skitterspec enable` with no install here (no manifest, or the managed files gone) installs it, as `init --local` does.
- `skitterspec update` on a disabled install refreshes the files and keeps it disabled.

- `skitterspec uninstall` on a local install prints what it would remove and changes nothing.
- `skitterspec uninstall --yes` removes every managed file that still matches the manifest, our hooks from `.claude/settings.local.json`, the marked block from `CLAUDE.local.md`, the manifest, `.spec-env/` and the exclude block.
- Afterwards no managed file is left under `.claude/`, so Claude finds no `/spec*` skill, command or rule, and a write on `main` is no longer refused.
- A managed file the developer edited is never deleted: it is moved to `<git-common-dir>/skitterspec-kept/<its path>` and listed with that path.
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
3. **Edited files are kept and parked out of Claude's reach.** Only a file
   whose hash matches the manifest is deleted. An unrecognised hash is
   cannot-tell (a user's edit, or a lost manifest), so it takes the harmless
   branch (`.claude/rules/negative-checks.md` rule 4) — but kept *in place*
   it is still loaded, and "Claude stops picking up the spec commands" would
   be false for anyone who edited one. So it moves to
   `<git-common-dir>/skitterspec-kept/<relPath>`: outside `.claude/`, outside
   the working tree (so `git status` is unchanged and no exclude is needed),
   and shared by every worktree. The report lists each with its parked path;
   restoring one is a hand `mv`. No `--force`: deleting the parked copies is
   the deliberate act.
4. **Refuse while anything is in flight.** Each worktree carries a seeded copy
   of the install (`localSeedFiles`), so its skills would break mid-work, and
   a torn-down primary leaves nothing to run `/spec-complete` with. The
   positive signal is the provisioned registry and the live lock; each is
   named with its exit (`/spec-complete`, `/spec-cancel`, `spec-env down`,
   `/spec-live main`). Nothing changes until they are gone.
5. **Only our hooks leave `settings.local.json`.** Reuse `removeHooks`, made
   to take `{ local }` as `ensureHooks` already does. A malformed file is
   reported and left alone, never rewritten.
6. **Disable and enable only change what Claude is told — never the files.**
   Every switch lives in `.claude/settings.local.json`, so it is per machine
   and reaches each worktree through the seeded copy. No single Claude Code
   setting covers all four kinds, so `disable` writes three and removes two:
   - `skillOverrides: { <name>: "off" }` for every managed skill and command
     (command files are skills to Claude Code). It hides each from Claude and
     from the `/` menu. Exact names, since the key takes no wildcard.
   - `claudeMdExcludes: ["**/.claude/rules/<file>"]` for every managed rule —
     a glob rather than an absolute path, so it matches in every worktree.
   - our hooks come out of the file (there is no per-hook switch, and
     `disableAllHooks` would turn off the developer's own too), and the block
     comes out of `CLAUDE.local.md`. `enable` writes both back from the
     shipped assets, so nothing has to be saved.

   Rejected: `permissions.deny: ["Skill(...)"]` — it refuses a call but leaves
   the skill listed, and covers neither rules nor hooks.
7. **The state is recorded in the manifest** (`enabled: false`), so
   `update` keeps a disabled install disabled and `enable`/`disable` are
   idempotent. `enable` removes only override and exclude entries naming a
   managed path, so an entry the developer wrote is never taken.
8. **`enable` installs when there is nothing to enable.** No manifest, or a
   local manifest whose files are gone, runs the `init --local` path — the
   developer asked to use it, and that is the one way to.
9. **`disable` refuses nothing for in-flight work.** It deletes nothing, and
   `enable` puts it back; a team install still refuses, since its hooks are
   committed and cannot be switched off for one person.
10. **The global npm package is not ours to remove.** The report's last line
   names `npm uninstall -g <distribution>`.

## Solution overview

`uninstall({ dir, yes })` in `init.js`:

1. Read the manifest. No manifest → nothing to uninstall (exit 0, says so).
   `scope` is not `local` → refuse (decision 2).
2. Read the registry and live lock; any entry → refuse naming each (decision 4).
3. Plan: for each manifest file, `managedState` → `remove` (pristine) or
   `park` (customized); the hooks to drop; the CLAUDE.local.md block; the
   manifest, `.spec-env/`, the exclude block.
4. Without `--yes`, print the plan. With it, act in this order: files (each
   through `assertSafeToDelete`, or moved to the park), empty skill/hook folders, hooks, CLAUDE
   block, exclude block, `.spec-env/`, manifest last — so a run that fails
   part-way can be re-run.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec uninstall [--yes]` |
| CLI command | add | `skitterspec disable`, `skitterspec enable` |
| Config key | add | `skillOverrides`, `claudeMdExcludes` entries in `.claude/settings.local.json` |
| Schema/model | update | manifest gains `enabled` |
| Service | add | `uninstall()` in `init.js` |
| Service | update | `removeHooks(dir, { local })`; CLAUDE block strip takes a target file |
| Docs | update | index, reference, provider pages: the way back from `init --local` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Uninstall engine and CLI verb, with tests | ✅ | [01-engine.md](01-engine.md) |
| 2 | Disable and enable, with tests | ✅ | [02-disable-enable.md](02-disable-enable.md) |
| 3 | Docs | ✅ | [03-docs.md](03-docs.md) |

## Open questions

- [ ] None

## Changelog

- 2026-11-20 — Spec created.
- 2026-11-20 — Decision 3 changed from keep-in-place to park in
  `<git-common-dir>/skitterspec-kept/`: an edited skill kept under `.claude/`
  is still loaded, so the uninstall would not stop Claude finding it. This
  also covers the "just disable it" ask — `uninstall --yes` then
  `init --local` is the round trip, so no separate enable/disable verb.
- 2026-11-20 — Reversed: `disable` and `enable` added (decisions 6–9, phase
  2). Install = files + enable; uninstall = disable + remove the files;
  enable/disable only switch whether Claude uses them, and enable installs
  when there is nothing to switch on. The mechanism follows Claude Code's
  settings: `skillOverrides` for skills and commands, `claudeMdExcludes` for
  rules, and the hooks and CLAUDE block written out and back. Docs moves to
  phase 3.
- 2026-11-20 — Phase 1: the CLAUDE.local.md strip is done inline in
  `uninstall` rather than by widening `stripClaudeMdSection`; the in-flight
  read anchors on the primary checkout as `spec-env` does, so a project in a
  repo subfolder or a run from a worktree sees the same registry. The
  `uninstall` reference row landed early because `docs-claims.test.js`
  requires every top-level verb on the site.
- 2026-11-20 — Phase 2: `enable` with nothing to switch on runs `init` in
  `update` mode with `local`, so it installs without touching committed
  config (isolation, gating). `init --local` on a disabled install switches
  it on too. The `disable`/`enable` reference rows landed with it for the
  same docs-claims reason. Unverified: Claude Code documents `skillOverrides`
  for skills, and treats command files as skills, but does not say outright
  that an override hides a `.claude/commands/` file — check by hand in a
  session after `disable`.
