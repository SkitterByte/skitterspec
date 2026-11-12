---
github_identifier: "#198"
github_url: "https://github.com/SkitterByte/skitterspec/issues/198"
---

# Live overlay for IDE-hosted apps in PR mode

> **Type:** Feature
> **Name:** feat-live-ide-hosted
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/198
> **Author:** Reuben Greaves
> **Raised:** 2026-11-12
> **Area:** packages/common/src/cli.js (specEnvLiveTake, DEPS_RE), packages/common/src/env/live.js (planTake, planRelease), packages/common/src/env/config.js (dev, live), packages/common/assets/core/env.config.md, packages/common/assets/commands/spec-live.md, docs/reference.html
> **Stack:** worktree
> **Docs:** reference

## Summary

`/spec-live` works for an app run from Visual Studio (or any IDE) and for a
project that lands through pull requests. It warns when NuGet or other
non-npm dependencies changed, tells you which app to restart instead of
assuming hot reload, and tests the branch against the remote base rather than a
stale local one.

## Problem

`/spec-live` already puts a spec's branch into the primary checkout without
merging anything, which is what a PR-mode .NET team needs for testing on the
usual host and ports. Three of its assumptions fit a Node dev server and break
there. The "dependencies changed, restart" warning only recognises npm, pnpm
and yarn files (`DEPS_RE`). Hot reload is assumed, so an IDE-hosted app gets
no restart prompt, and a configured port that isn't listening because VS is
closed blocks the take outright. And in PR mode local base moves only when
someone pulls, so the take rebases onto a stale base. Separately,
`live.migrations` defaults to empty and nothing documents the EF Core glob, so
a spec with a migration can go live against the shared dev DB.

## Acceptance criteria

- A branch that changes a file matching any `setup` entry's `when` glob (e.g.
  `**/*.csproj`) makes `live take` print the restart warning. The npm/pnpm/yarn
  files still trigger it in a project with no `when` globs.
- A `dev` entry with `"reload": "restart"` that is not listening does not block
  `live take`. It warns instead, and both take and `/spec-live main` name that
  entry as needing a restart.
- A `dev` entry with no `reload` (or `"hot"`) behaves exactly as today.
- With `land.strategy: "pr"`, `live take` fetches and rebases onto
  `<remote>/<base>`. If the fetch fails it rebases onto local base and says
  so. Trunk mode is unchanged.
- `env.config.md` and `docs/reference.html` show an EF Core
  `**/Migrations/**` example for `live.migrations`, plus the new `reload`
  key.

## Decisions

1. **Dependency changes are read from the project's own `setup` `when`
   globs**, plus the existing npm list as a fallback. The project already
   declares which files need setup re-run, and those files need a restart for
   the same reason. Rejected: a separate `live.dependencies` list (a .NET
   project would declare its manifests twice) and hardcoding .NET into the
   regex (puts stack knowledge in the engine and leaves pip and Go uncovered).
2. **Hot reload or restart is declared per `dev` entry**:
   `reload: "hot" | "restart"`, default `hot`. That covers a hot-reloading UI
   beside a VS-hosted API. Rejected: a project-wide `live.reload`, which would
   drop the UI's health gate along with the API's.
3. **A `restart` entry that isn't listening is a warning, not a refusal.**
   The probe exists to confirm something will pick up the switch. For a
   restart entry the operator does that by hand after the switch, so a closed
   IDE is the normal state rather than an error.
4. **PR mode rebases onto `<remote>/<base>`, automatically and without a
   consent step.** This reverses the 2026-11-06 `feat-pr-landing` decision to
   keep `live take` on local base. That decision's reason was trunk-docs
   authoring, but the spec commit is on the branch and gets replayed, not
   lost. No consent is needed because take already rewrites the branch on
   every run, and the PR push already uses `--force-with-lease`
   (`integrate.js:221`), so nothing new is put at risk. A failed fetch is
   cannot-tell, so it falls back to local base and warns rather than refusing
   (`.claude/rules/negative-checks.md` rule 4). Rejected: a `--fresh` flag,
   because a stale default is the problem being fixed.
5. **Migrations guidance is docs only.** Rejected: having `init` detect a
   `.csproj`. That would be the first stack detection in init, for a single
   glob.

## Solution overview

- `specEnvLiveTake` computes `depsChanged` as the changed files matching
  `config.setupTriggers` globs (or the npm fallback list).
- `config.js` accepts `dev[].reload`, normalised to `hot` and refusing any
  other value. The port probe treats `restart` entries as advisory, and
  `planTake`/`planRelease` take the restart entries' names and emit
  `restart <name>` warnings.
- With `land.strategy: "pr"`, take runs `git fetch <remote> <base>` and passes
  `<remote>/<base>` to `planTake` as the rebase target. A failed fetch passes
  local base plus a warning.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `dev[].reload`: `"hot"` (default) · `"restart"` |
| CLI command | update | `spec-env live take`: deps from `setup` `when`; restart entries warn; PR mode rebases onto `<remote>/<base>` |
| CLI command | update | `spec-env live release`: prints restart reminders |
| Business rule | update | live take's rebase target in PR mode (reverses feat-pr-landing 2026-11-06) |
| Skill/rule | update | `/spec-live` command text: restart, PR-mode base |
| Docs | update | env.config.md, reference.html: `reload`, EF `live.migrations` example |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Dependency changes from `setup` `when` globs | ✅ | [01-deps-from-setup-when.md](01-deps-from-setup-when.md) |
| 2 | `dev[].reload` — restart-hosted apps | ✅ | [02-restart-dev-entries.md](02-restart-dev-entries.md) |
| 3 | PR-mode rebase onto remote base + migrations docs | ⬜ | [03-pr-remote-base-and-docs.md](03-pr-remote-base-and-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-12 — Spec created.
- 2026-11-12 — Phase 1: the npm set is always checked alongside the `when`
  globs, not only as a fallback when none are declared. A project whose
  triggers name only a schema file would otherwise lose the lockfile warning.
  `docs/reference.html` does not describe the warning, so it was not touched.
- 2026-11-12 — Phase 2: an unrecognised `reload` value falls back to `hot`
  instead of raising a config error. That matches how every other enum in
  `config.js` is read (`mode`, `land.strategy`), and `hot` is the conservative
  reading because it keeps the listening check. The `/spec-live` command text
  needed no change: it relays the engine's warnings verbatim.
