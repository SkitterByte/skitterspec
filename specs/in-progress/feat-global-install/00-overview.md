---
github_identifier: "#278"
github_url: "https://github.com/SkitterByte/skitterspec/issues/278"
---

# Global installs side by side, and one update for every project

> **Type:** Feature
> **Name:** feat-global-install
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/278
> **Author:** Reuben Greaves
> **Raised:** 2026-11-20
> **Area:** packages/{github,linear,jira,azure-boards}/package.json, packages/skitterspec-*/package.json, packages/common/src/init.js, packages/common/src/cli.js, packages/common/src/tada/transcripts.js, packages/common/assets/rules/spec-planning.md, packages/*/MIGRATION.md, docs
> **Stack:** worktree
> **Docs:** index, reference, github, linear, jira, azure-boards

## Summary

Several skitterspec providers can be installed globally on one machine at
once, and one `skitterspec update --all` brings every local-scope project up
to date after a release. A guide shows how to move each kind of existing
install over.

## Problem

Every release currently means a round of `skitterspec update` in 3–4 projects,
each with its own review, plus a PR for LSC, whose install is a committed
`package.json` dependency. A local install (`init --local`) with a global CLI
would remove most of that, but a machine can't hold two providers globally:
every provider package also exposes a `skitterspec` bin, and npm refuses the
second one (`npm error File exists: …/bin/skitterspec`, verified 2026-11-20).
So a machine with a GitHub project and an Azure project has to keep at least
one of them on a `node_modules` install. And even with global installs there
is no single command to update every project.

## Acceptance criteria

- `npm i -g @skitterbyte/skitterspec @skitterbyte/skitterspec-github @skitterbyte/skitterspec-azure-boards`
  succeeds on a clean machine, and `skitterspec`, `skitterspec-github` and
  `skitterspec-azure-boards` are all on PATH.
- In a local-scope project using a global install, every slash command and
  every skill command runs, with no `node_modules`.
- `skitterspec update --all` updates every local-scope project on the machine
  with that project's own provider, prints one line per project, and leaves
  `git status` clean in each one.
- A team-scope project is listed by `update --all` with the action to take,
  and nothing in it is written.
- A project whose provider isn't installed globally is listed with the exact
  `npm i -g` to run, and is skipped.
- `MIGRATION.md` and the docs walk through converting each existing install
  shape (a global provider, a committed dependency, a solo committed install,
  a team install) step by step.

## Decisions

1. **Provider packages stop exposing `skitterspec`.** Each one exposes only
   `skitterspec-<provider>`, so all of them install globally side by side. It's
   a breaking change, so the four providers get a major bump. The rejected
   alternative was to keep the alias and change only how commands render; that
   still leaves npm refusing a second global provider.
2. **`skitterspec` always means the base package, installed alongside each
   provider**: globally (`npm i -g @skitterbyte/skitterspec …`) or as a second
   dev dependency in a team project. The skills, rules and hooks name
   `skitterspec` in many places and stay as written. The rejected alternative
   was rewriting every bin mention in skills and rules to the provider's bin at
   install time: a lot of asset churn, easy to break, and it touches text that
   isn't tokenised today.
3. **The base and a provider must be the same version, and only a warning says
   so.** They're released in lockstep, but two global installs can drift.
   `update` compares the base version on PATH (or in `node_modules`) with its
   own and prints one line when they differ. A mismatch never stops an update.
4. **The rendered command lines name the bin they invoke, with the right
   package.** Commands keep `{{exec}} skitterspec`. The local-rung launcher
   (bug-commands-outside-project) currently looks for the *distribution's*
   package and reads its `skitterspec` bin. After decision 1 that bin is gone,
   so the launcher maps bin to package (`skitterspec` →
   `@skitterbyte/skitterspec`, `skitterspec-<p>` →
   `@skitterbyte/skitterspec-<p>`). The PATH rung checks for the named bin
   specifically, not any engine name. That way a GitHub-only PATH can't render
   a bare `skitterspec` that doesn't exist.
5. **`init`/`update` warn when `skitterspec` itself can't be found** in a
   provider project. Commands and skills need it, so the warning names the
   install to add. It warns rather than refusing, the same as the existing
   cannot-tell rung.
6. **`update --all` updates local-scope projects only.** Their managed files
   are git-excluded, so an unattended update dirties nothing. A team-scope
   project gets one line, `team install — update it on a /no-spec branch`, and
   nothing in it is written. A disabled local install
   (`skitterspec disable`) is listed as disabled and skipped.
7. **Projects are found from Claude Code's own project list**: the folders
   `tada` already reads (`knownDirs`), filtered to those holding
   `specs/.core/.skitterspec-manifest.json`. Using that positive signal means a
   folder that merely appears in the transcripts is never updated. It's
   machine-local, so the Mac and the Windows VM each run `--all` for their own
   checkouts.
8. **Each project is updated by its own distribution.** The manifest records
   `distribution` from now on. For older manifests it's inferred from the
   provider config in `specs/.core/` (`github.config.json` → github, and so
   on), and with none it's the base. `--all` runs that distribution's global
   bin in the project folder. If that bin is missing, it prints the
   `npm i -g …` line and skips the project, rather than writing another
   provider's skills into it.
9. **`--all` prints one line per project and exits 1 if any update failed.**
   Skipped and listed projects don't count as failures. Each line shows the
   project name, scope, distribution, and the outcome (`updated N` · `current`
   · `skipped — <why>` · `failed — <first error line>`).
10. **The install guide covers every existing shape**, in each
    `MIGRATION.md` and a docs section. The steps for an old global provider
    must be done in order: upgrade the provider first, which removes its
    `skitterspec` link, then install the base. Otherwise npm refuses the base
    with `EEXIST`.
11. **No change to what Claude loads, and no added cost per tool call.** The
    skills, rules, commands and hooks stay in each project, as local installs
    do today. Nothing goes into `~/.claude`, so repos without skitterspec pay
    nothing. That per-repo cost was the reason the user-scope install was
    rejected (feat-local-install, decision 1). A global CLI changes only where
    the engine is found, and the hooks spawn the same engine either way. The
    version check (decision 3) adds one `skitterspec --version` per `update`
    (about 40 ms), never per tool call. `--all` runs only when asked. Measured
    2026-11-20 on this repo, per command run: `pnpm exec` 108 ms, `npx` 195 ms,
    the launcher 67 ms, a bare global bin about 40 ms.

## Solution overview

```
# once per machine (Mac and Windows VM each), after a release
npm i -g @skitterbyte/skitterspec @skitterbyte/skitterspec-github @skitterbyte/skitterspec-azure-boards
skitterspec update --all
```

```
update --all — 4 projects
  skitterspec      team  · github       listed  — team install, update it on a /no-spec branch
  skitterload      local · github       updated 6 files
  LSC App          local · azure-boards updated 6 files
  side-thing       local · linear       skipped — npm i -g @skitterbyte/skitterspec-linear
```

Conversions the guide walks through:

| You have | Do |
|----------|----|
| A global provider from before the major | `npm i -g @skitterbyte/skitterspec-<p>@latest` first (drops its `skitterspec` link), then `npm i -g @skitterbyte/skitterspec` |
| A solo project with a committed install or dependency | `skitterspec init --local`, commit the staged removals, remove the dependency from `package.json` and the lockfile, install globally |
| A team project with a dependency | add `@skitterbyte/skitterspec` as a second dev dependency at the same version; `update` on a `/no-spec` branch as before |
| A Windows VM | the same global installs inside the VM; it has its own PATH |

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | remove | `skitterspec` bin from the four provider packages |
| CLI command | add | `skitterspec update --all` |
| Config key | add | manifest `distribution` |
| Service | update | `renderCommand` launcher maps bin → package; PATH rung checks the named bin |
| Service | update | `init`/`update` warn on a missing base and on a base/provider version mismatch |
| Skill/rule | update | `spec-planning.md` binary-name contract |
| Docs | update | `MIGRATION.md` (base + four providers), index, reference, provider pages |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Providers drop the alias; the base answers `skitterspec` | ✅ | [01-drop-alias.md](01-drop-alias.md) |
| 2 | `update --all` | ✅ | [02-update-all.md](02-update-all.md) |
| 3 | Install and conversion guide | 🔄 | [03-install-guide.md](03-install-guide.md) |

## Open questions

- None

## Changelog

- 2026-11-20 — Spec created, following on from bug-commands-outside-project.
  The user-scope plugin install (rejected in feat-local-install, Decision 1)
  stays out of scope. This takes the cheaper route of global CLIs plus local
  installs.
- 2026-11-20 — Phase 1: the private `packages/github` dropped its alias too,
  so this repo's root now takes the base as a dev dependency
  (`@skitterbyte/skitterspec-common`) for its own `pnpm exec skitterspec`.
  That's decision 2 applied to ourselves. The hooks were left unchanged and
  not covered by a new test: their `ENGINES` walk already looks for
  `skitterspec` first, which is now the base.
- 2026-11-20 — Phase 2: a linked worktree and a subfolder both fold into the
  primary checkout's project, so each project is updated once (local
  installs seed their worktrees from the primary). `update --all` is exempt
  from the bins' uncomposed-assets refusal: it writes nothing itself and runs
  each project's own bin. A read-only run of the planner on the author's
  machine found 7 projects in 357 ms (3 local, 4 team).
- 2026-11-20 — Phase 3: decision 10 checked against npm with stand-in
  packages. Installing the upgraded provider and the base in one command
  works in either order, and so does upgrading the provider first. Only the
  base on its own, while an old provider still owns the name, hits
  `EEXIST`. The guide gives the one-command form. The "install one
  distribution, never both" wording in the READMEs, the SETUP files and the
  docs pages is replaced. Walking the guide needs the release to exist, so
  it waits as the phase's manual steps.
- 2026-11-20 — Landed intermediate work onto main so it can be released:
  phase 3's manual steps walk the guide against the published packages.
  The spec stays in progress.
