---
linear_identifier: "SKS-401"
linear_url: "https://linear.app/skitterbyte/issue/SKS-401/hotfix-release-lifecycle-release-seam-clean-carry-pushed-tag-deferred"
---

# Hotfix release lifecycle: release seam, clean carry, pushed tag, deferred teardown

> **Type:** Feature
> **Name:** feat-hotfix-release (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-10-21
> **Area:** packages/common/src/env/hotfix.js, packages/common/src/env/config.js, packages/common/src/cli.js, packages/common/src/env/teardown.js, packages/common/assets/skills/{spec-hotfix,spec-complete}/SKILL.md, packages/common/assets/core/env.config.md, MIGRATION.md
> **Stack:** worktree

## Problem

`/spec-hotfix` → `/spec-complete` cannot ship a prod hotfix by itself. ereqs keeps four
local scripts (`hotfix-start/land/finish.ts`, `release-hotfix.sh`) beside it, and its
CLAUDE.md warns not to mix the two on one fix.

What `hotfix land` does today (`src/env/hotfix.js`, unchanged since 18.0.0):
- It emits a bare `git tag` from `bumpPatch`, with no version commit, changelog or notes.
- It drops a `-hotfix.N` suffix (`bumpPatch('v36.4.0-hotfix.1')` = `v36.4.1`).
- It blocks when `vX.Y.(Z+1)` already exists.
- It ignores `hotfix.bump`: the key is parsed in `config.js` and never read.
- It cherry-picks the whole `baseRef..branch` range onto main.
- It never pushes, and `/spec-complete` tears the branch down at land time.

skittership 2.1.0 shipped `scripts/release-hotfix.cjs`: a version commit plus a
`<root>-hotfix.N` tag, reported as one JSON line. This spec plugs it in (handoff 2
of 2, from ereqs).

## Decisions

1. **`hotfix.releaseWith` is the release seam**, the same shape as `review.commitWith`.
   - It is a command run in the hotfix worktree. The suggested value is
     `node scripts/release-hotfix.cjs --json`, called with node directly so that no
     package-manager banner can reach stdout.
   - stdout must parse strictly as `{tag, version, baseTag, branch, versionCommit, pushed}`.
     A non-zero exit or unparseable stdout is a refusal: relay the stderr line, and
     push and carry nothing.
   - skitterspec never passes `--push`, because it owns the push.
2. **Without `releaseWith`, the built-in tagger makes `hotfix.bump` real.**
   - `patch`, the default, is today's behaviour exactly.
   - `hotfix-suffix` gives `<root>-hotfix.<N+1>`, where N is the highest
     `<root>-hotfix.*` tag in the repo. That is skittership's rule, so the two tools
     cannot disagree. A later `vX.Y.(Z+1)` neither blocks it nor counts.
   - An unknown `bump` value is a config error, never a silent fallback.
3. **`hotfix land` executes, like `bootstrap`; it no longer prints a plan for the skill to
   run.**
   - The prod tag isn't known until the release has run, so a printed plan can't name
     it.
   - Steps run in order: release → push → carry. It stops at the first failure.
   - Each step's outcome is recorded in `.spec-env`, so a re-run resumes rather than
     re-releasing. A second release refuses anyway, because HEAD is already tagged.
   - `--plan` describes the steps without running them, and `--json` carries the
     outcomes.
4. **Push happens before the carry, behind consent.**
   - The branch is pushed first, then the tag, because the tag push starts the deploy.
   - Consent is `--push` on the CLI; the skill asks the operator before passing it.
   - Without `--push`, land stops after the release and prints both push commands.
   - A re-run carries once `git ls-remote` shows the tag on the remote. That is a
     positive signal, so a hand-run push is honoured.
   - Pushing before carrying means a declined or failed push never leaves main
     carrying a fix whose tag was never published.
5. **The carry excludes the version commit.**
   - Carry = `rev-list --reverse baseRef..branch`, minus `versionCommit`, minus what
     `git cherry <main> <branch>` marks `-`. Main's version line never moves on a
     hotfix.
   - The spec's own completion commits are carried. They come before the version
     commit because `/spec-complete` §4 commits before land, and that also satisfies
     releaseWith's clean-tree and untagged-HEAD refusals.
   - An empty carry is a reported no-op.
   - Landing strategy, from ereqs' `hotfix-land.ts`:
     - main checked out and clean → cherry-pick in place;
     - main not checked out → a throwaway worktree, removed afterwards;
     - main checked out and dirty → refuse, printing the manual command;
     - a conflict → `cherry-pick --abort`, name the commit, and leave the branch
       alone.
6. **Teardown waits for the deploy: `spec-env hotfix finish`.**
   - `/spec-complete` on a hotfix lands, pushes and keeps the worktree. Running
     `/spec-complete` again on a landed hotfix routes to `finish`.
   - `finish` needs a clean tree, a release tag at HEAD (including `-hotfix.N`) and
     the branch on the remote. Then it runs `branch -D`.
   - There is no "merged into main" guard: the version commit never reaches main, so
     `-d` would always refuse. There is also no `--force`.
   - It reuses teardown's `reachableFromTag`, and its push guard reads like
     `guards.refuseTeardownIfUnpushed`.
   - This is what replaces ereqs' `release:hotfix --finish`, which skittership's
     `update --force` removes.
7. **Extra targets (`hotfix.targets` / `--also`) stay tag-only, and the docs say so.**
   - They keep the throwaway-worktree cherry-pick plus the built-in tagger, and now
     honour `hotfix.bump`.
   - `releaseWith` is for the prod line only. Running skittership's release per target
     would need a `hotfix/` branch and a clean tree for each one.
8. **Tag order is `X.Y.Z-rc.N < X.Y.Z < X.Y.Z-hotfix.N < X.Y.(Z+1)`**, from one commented
   comparator.
   - It matches skittership and git's `version:refname`.
   - Hotfix suffixes sort after their base; every other suffix sorts before it, as in
     semver.
   - Base tags may be hotfix tags: a hotfix on `v36.4.0-hotfix.2` gives `-hotfix.3`.
   - The base is still the spec's `Base version`, not re-derived.
9. **Branch prefix:** skittership refuses a branch outside `hotfix.branchPrefix` (default
   `hotfix/`). The default `branch.pattern` `{type}/{slug}` already gives `hotfix/<slug>`,
   so this is a docs note plus a test. A custom pattern that breaks it surfaces as
   releaseWith's own refusal, relayed.
10. **`postversion` is not skitterspec's to bypass.** A project with a `postversion` script
    adds `--allow-postversion` to its own `releaseWith`; the docs say so.
11. **It is a major** for both packages, because `hotfix land` stops printing commands and
    runs them itself. MIGRATION.md gets an entry.

## Solution overview

```
/spec-complete (hotfix)
  §4 commit status flip + git mv           (tree clean, HEAD untagged)
  hotfix land [--push]                     (engine runs, records each step)
    1 release   releaseWith → JSON | built-in tagger (bump: patch | hotfix-suffix)
    2 push      branch, then tag            (only with --push; else print + stop)
    3 carry     baseRef..branch − versionCommit − cherry(-) → main
                in place | throwaway worktree | refuse when main is dirty
  worktree kept
/spec-complete again (or hotfix finish)
  guards: clean · release tag at HEAD · branch on remote  →  worktree remove, branch -D
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `hotfix.releaseWith` (string command) |
| Config key | update | `hotfix.bump` now read: `patch` (default) · `hotfix-suffix`; unknown → error |
| CLI command | update | `spec-env hotfix land [spec] [--push] [--plan] [--json] [--also <tag>]` executes |
| CLI command | add | `spec-env hotfix finish [spec]` (guarded teardown, no `--force`) |
| Domain object | add | tag comparator `compareTags`; `nextHotfixTag` |
| Domain object | update | registry records a hotfix's release `{tag, versionCommit, baseTag, pushed, carried}` |
| Business rule | update | carry excludes the version commit and `git cherry` duplicates |
| Skill/rule | update | `/spec-hotfix`, `/spec-complete` §6-hotfix/§7: release, consent, deferred teardown |
| Docs | update | `env.config.md`, MIGRATION.md (major for both packages) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Tag order, bump strategies, hotfix-suffixed bases | ⬜ | [01-tags-and-bump.md](01-tags-and-bump.md) |
| 2 | `hotfix land` executes: release step + `releaseWith` seam | ⬜ | [02-release-step.md](02-release-step.md) |
| 3 | Push behind consent, resumable | ⬜ | [03-push.md](03-push.md) |
| 4 | Carry to main without the version commit | ⬜ | [04-carry.md](04-carry.md) |
| 5 | `hotfix finish` and the end-to-end test | ⬜ | [05-finish.md](05-finish.md) |
| 6 | Skills, docs, MIGRATION | ⬜ | [06-skills-and-docs.md](06-skills-and-docs.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-21 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-10-21 — Spec created from the ereqs/skittership handoff (2 of 2). Its
  "What skittership 2.1.0 actually shipped" section was taken as authoritative. Line
  references were re-checked against 23.0.1.
