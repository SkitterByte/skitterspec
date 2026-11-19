---
github_identifier: "#234"
github_url: "https://github.com/SkitterByte/skitterspec/issues/234"
---

# Local-only install

> **Type:** Feature
> **Name:** feat-local-install
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/234
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** packages/common/src/init.js, packages/common/src/cli.js, packages/common/src/env/hooks.js, packages/common/src/env/bootstrap.js, packages/common/src/env/config.js, packages/{azure-boards,github,jira,linear}/assets, scripts/build-dist.js, docs
> **Stack:** worktree
> **Docs:** reference, azure-boards, github, jira, linear

## Summary

`skitterspec init --local` sets skitterspec up in a shared repo for one
developer only: the skills, commands, rules, hooks and CLAUDE block stay on
that developer's machine and out of git, while `specs/` is still committed.
An existing committed install can be converted in place.

## Problem

`init` writes `.claude/skills`, `commands`, `rules`, `hooks`, three hook
entries in `.claude/settings.json` and a `CLAUDE.md` block, and all of it is
committed. On a team where one developer uses skitterspec (LSC), every
teammate's Claude Code then loads ~30k tokens of rules and the CLAUDE block
per session and runs three hooks on every tool call, for a workflow they do
not use. Provider skills also hard-code `pnpm exec skitterspec-<provider>`, so
they only work with a local `node_modules` install — which in a shared repo
means a `package.json` dependency only one person wants.

## Acceptance criteria

- `skitterspec init --local` in a clean repo leaves `git status` showing only
  `specs/` paths; skills, commands, rules, hooks and the CLAUDE block all work
  in a Claude Code session there.
- `skitterspec update` in that repo stays local — it never writes to
  `.claude/settings.json`, `CLAUDE.md`, or a tracked `.claude/` path.
- `init --local` on a repo with a committed install leaves the managed files on
  disk but staged for removal from git, with hooks and the CLAUDE block moved
  to their local homes; teammates who pull that commit lose them.
- With the CLI installed globally (no `node_modules`), provider skills invoke
  the bare bin, and `/spec-push` etc. run.
- A session started inside a spec's worktree sees the skills, commands, rules
  and hooks.
- A team (non-`--local`) install behaves exactly as before.

## Decisions

1. **Local-only project install, not a global/user-scope install.** A user-scope
   install (~/.claude plus a unified all-provider package) was designed and
   rejected: it lists ~2.5k tokens of skill descriptions and starts three hook
   processes per tool call in *every* repo, needs the four provider packages
   merged (release-process change), adds a second permanent install layout,
   and loses the team benefits of committed config (one enforced version, no
   per-person setup). The local install solves the actual complaint — pollution
   of a repo only one person uses — with existing machinery. Cost accepted:
   updates stay per repo.
2. **Everything git would carry goes in `.git/info/exclude`**, never
   `.gitignore` — editing `.gitignore` is a committed change, the thing being
   avoided. `info/exclude` lives in git's common dir, so it covers every
   worktree.
3. **Hooks register in `.claude/settings.local.json`; the CLAUDE block goes in
   `CLAUDE.local.md`.** Both are Claude Code's per-machine homes for exactly
   this content.
4. **`specs/` stays committed** (including `specs/.core` config). Specs must
   travel with branches and PRs; markdown costs teammates nothing. The install
   manifest is the exception — it describes local files, so it is excluded too.
5. **The manifest records `scope: "local"`**, and `update` reads it, so a
   later `update` (or `init` without the flag) cannot write team-mode files
   into a local repo. Absent scope = team, so every existing manifest reads as
   it does today.
6. **Provider assets use the `{{exec}}` runner token** that command files
   already use, rendered at install by `detectRunner` (local → lockfile
   runner, PATH → bare, none → npx). This fixes the global-CLI case for local
   installs and npm-based team installs alike. Local-mode files are
   per-machine, so baking the runner in is correct there; team mode keeps
   today's caveat.
   **No npx form may resolve an unscoped name from the registry.** The bins
   `skitterspec` and `skitterspec-<provider>` are not npm package names (they
   404 today, so anyone could register them). The `npx` rung renders
   `npx --no-install <bin>` (fails rather than fetches when `node_modules` is
   missing) and the `none` rung renders `npx -p @skitterbyte/<distribution>
   <bin>`. This also changes today's rendered command files.
7. **Converting a committed install is part of `init --local`**:
   `git rm --cached` on the managed tracked files (staged, never committed —
   the operator commits the removal), our hook entries moved from
   `settings.json` to `settings.local.json` (others' entries untouched), the
   managed CLAUDE block moved to `CLAUDE.local.md`. A managed file whose
   content is `customized` is converted too — it stays on disk unchanged.
8. **`package.json` is never edited.** If it lists a skitterspec package, init
   reports it and names the global install as the replacement; removing a
   dependency is the repo's decision.
9. **Worktrees get the local install by symlink seeding.** In local mode
   `bootstrap` seeds `.claude/{skills,commands,rules,hooks}`,
   `.claude/settings.local.json` and `CLAUDE.local.md` from the primary
   checkout, reusing the seed step (copy fallback where symlinks are
   unavailable). Implicit from the manifest scope — nothing added to the
   committed `env.config.json`. Seeding `settings.local.json` deliberately
   carries that developer's personal permissions into each worktree: in local
   mode the worktrees are theirs alone.
10. **`--local` is for a developer alone on a shared repo, never a team.** The
   hooks and rules are team policy; excluding them strips every other
   developer and worktree of them. The docs say so, and `init --local` prints
   it once. A side benefit worth stating: in local mode `update` writes only
   excluded files, so it never dirties the base branch.

11. **Paths are relative to the git root, not the install folder.** An install
   may sit below the repo root (LSC: root `LSC App/`, install in
   `FF.CSC.Solution/`), so exclude entries and `git rm --cached` paths carry
   the `git rev-parse --show-prefix` prefix.

## Solution overview

`init --local` runs the normal install with three redirections (hooks →
`settings.local.json`, block → `CLAUDE.local.md`, exclude entries appended to
`.git/info/exclude` under a marked block), then records `scope: "local"` in an
excluded manifest. If it finds a committed install it converts it first. Rules
keep auto-loading for the one developer, unchanged. `bootstrap` reads the
scope and seeds the local paths into each worktree.

```
# .git/info/exclude
# >>> skitterspec (local install)
/.claude/skills/<each managed skill>/
/.claude/commands/<each managed command>.md
/.claude/rules/<each managed rule>.md
/.claude/hooks/<each managed hook>.cjs
/CLAUDE.local.md
/specs/.core/.skitterspec-manifest.json
/.spec-env/
# <<< skitterspec
```

Entries are per managed path, not whole directories, so a teammate's own
`.claude/skills/foo` is unaffected.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec init --local` |
| CLI command | update | `skitterspec update` honours manifest scope |
| Config key | add | manifest `scope: "local"` |
| Skill/rule | update | provider skills, rules, seams, SETUP use `{{exec}}` |
| Service | update | `bootstrap` seeds local-install paths in local mode |
| Service | update | hook registration targets `settings.json` or `settings.local.json` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Runner token in provider assets | ⬜ | [01-provider-runner.md](01-provider-runner.md) |
| 2 | Fresh `init --local` and scoped `update` | ⬜ | [02-local-init.md](02-local-init.md) |
| 3 | Convert a committed install | ⬜ | [03-convert.md](03-convert.md) |
| 4 | Seed the local install into worktrees | ⬜ | [04-worktree-seed.md](04-worktree-seed.md) |
| 5 | Docs | ⬜ | [05-docs.md](05-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-19 — Spec created. A global/user-scope install (unified provider
  package, ~/.claude plugin-style install) was explored and rejected in
  favour of this; see Decision 1.
- 2026-11-19 — Impact check from skitterload (team install, pnpm, solo):
  works as-is — Phase 1 renders its existing `pnpm exec` text byte-identical.
  Two conversion gaps folded into Phases 2–3: merge into an existing
  `settings.local.json`, and a markerless CLAUDE section is reported, not
  moved.
- 2026-11-19 — Impact check from an Azure Boards project (team install,
  pnpm, 4 customized files — all already correct): works as-is. Folded in:
  per-entry hook removal in mixed matcher groups, the team-policy warning
  (Decision 10), and the deliberate spread of `settings.local.json` into
  local-mode worktrees (Decision 9).
- 2026-11-19 — Impact check from LSC (team install, npm, Mac + Windows VM
  over one checkout): works with two small changes on its side. Phase 1
  fixes it today (provider files hard-code `pnpm exec` on an npm project).
  Folded in: npx never resolves an unscoped name (Decision 6), and paths
  relative to a git root above the install (Decision 11). Its report of a
  second contributor's `.claude/specs` files was checked: she has no
  skitterspec install and skitterspec never writes there, so LSC remains a
  single-user repo and the premise stands.
