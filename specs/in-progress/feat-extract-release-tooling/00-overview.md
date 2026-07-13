# Extract release tooling into skittership

> **Type:** Feature
> **Status:** In Progress — Phases 1–3 done; Phase 4 (publish) next (started 2026-07-13)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-13
> **Area:** assets/skills/commit/, assets/rules/commit-messages.md, assets/scripts/generate-{changelog,releases}.js, assets/scripts/lib/{git-commits,config}.js, src/{init,cli,config}.js, assets/claude-md-section.md, test/, package.json — plus a new sibling repo `skittership`
> **Stack:** worktree

## Problem

skitterspec is a spec-driven-development installer, but it also bundles an
entire release/changelog subsystem — the `/commit` skill, the
`commit-messages.md` rule, the `CHANGELOG.md`/`RELEASES.md` generators, their
shared `lib/`, a root `skitterspec.config.json`, and the `--changelog/--releases`
init flags. That machinery has nothing to do with specs: it can't be adopted or
ignored on its own, it bloats every skitterspec install, and it couples an
unrelated concern to the core workflow. Users should be able to take
spec-driven-development without release tooling, and release tooling without
specs.

## Decisions

1. **New standalone package `@skitterbyte/skittership`, in its own repo.** "ship"
   = releasing; short, no double-`r`. It's a second *installer/scaffolder* with
   the same shape as skitterspec (`bin/`, `src/{init,cli,config}.js`, `assets/`),
   invoked as `npx @skitterbyte/skittership init`. Rejected a monorepo/workspaces
   and a second bin in this package — the release slice is genuinely independent
   (see decision 2), so a clean separate repo has near-zero code-sharing cost and
   the simplest adoption story.
2. **The slice is self-contained.** The shared `lib/git-commits.js` and
   `lib/config.js` are pulled in *only* when changelog/releases are enabled; core
   `spec-env`/`spec-sync`/`init` never touch them, and isolation/Linear use their
   own `specs/.core/{env,linear}.config.json`. So `skitterspec.config.json` (keys
   `changelog`/`releases`/`versionHook`) is 100% release-facing and moves wholesale
   — skitterspec-core ends up with **no** root config file.
3. **`/commit` + `commit-messages.md` move entirely to skittership.** The commit
   skill is built around the `Release-Note:`/`Release-Area:` footer grammar and
   the scope→area map, so it belongs with the tooling that consumes it. skitterspec
   stops shipping both; a spec-only user commits by hand. Rejected splitting a
   lean `/commit` into core (two versions + a layering mechanism to maintain).
4. **Config file: `skittership.config.json` only, no runtime fallback.** The
   loader reads exactly one filename. skittership `init` **migrates** an existing
   `skitterspec.config.json` by renaming it (carrying the release keys) on adopt.
   Rejected keeping the old name (confusing for skittership-only users) and a
   loader fallback (leaves two live names indefinitely).
5. **skitterspec `update` offers to remove legacy release files.** On detecting
   installed release tooling it interactively offers to delete it and points at
   skittership. **Guarded:** non-TTY/CI and `--yes` never auto-delete — they print
   a one-time notice only; removal requires an interactive `y` or an explicit flag.
   Rejected leaving files as-is silently (defeats the extraction) and hard-removal
   (destructive).
6. **This repo becomes a skittership consumer (dogfood).** skitterspec's own
   `package.json` `version` hook and `/commit` usage are re-sourced from skittership
   (dev dependency / `npx`), and docs (`README`, `assets/claude-md-section.md`, the
   spec-planning rule's release paragraphs) are updated.

## Solution overview

Order is dependency-driven: skittership must exist and be adoptable **before**
skitterspec removes the tooling, so users have somewhere to land.

1. **Stand up skittership** (new repo): scaffold the package, move the release
   assets in, `init` copies them + writes `skittership.config.json` + wires the
   npm `version` hook, with `skitterspec.config.json → skittership.config.json`
   migration. Port the release tests.
2. **Strip release tooling from skitterspec:** delete the release assets/tests,
   remove the release config/flags/prompts from `src/{init,cli,config}.js`, so a
   skitterspec install is spec-only.
3. **Add the guarded deprecation/removal flow to `skitterspec update`.**
4. **Publish skittership** to GitHub + npm (operator runs `npm publish`), so it's
   a real installable package.
5. **Migrate this repo to consume the published skittership + refresh docs.**

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Stand up the skittership package (new repo) | ✅ | [01-standup-skittership.md](01-standup-skittership.md) |
| 2 | Strip release tooling out of skitterspec | ✅ | [02-strip-skitterspec.md](02-strip-skitterspec.md) |
| 3 | Guarded deprecation/removal in `skitterspec update` | ✅ | [03-update-deprecation.md](03-update-deprecation.md) |
| 4 | Publish skittership (GitHub + npm) | ⬜ | [04-publish-skittership.md](04-publish-skittership.md) |
| 5 | Dogfood: consume skittership + refresh docs | ⬜ | [05-dogfood-and-docs.md](05-dogfood-and-docs.md) |

## Open questions

- [x] How does this repo depend on skittership for dogfooding? **Resolved:** a new
      Phase 4 publishes `@skitterbyte/skittership` (operator runs `npm publish`),
      so Phase 5 depends on the published package (falling back to `file:../` only
      if publish is deferred).

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-13 | Draft | backlog | Reuben Greaves |
| 2026-07-13 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-13 — Spec created. Decisions locked via grilling: name `skittership`;
  separate repo; `/commit` + rule move wholesale; `skittership.config.json` only
  (no fallback, init migrates); `update` offers guarded removal; this repo
  dogfoods skittership.
- 2026-07-13 — Inserted a new **Phase 4 — Publish skittership** (GitHub + npm)
  before dogfood; old Phase 4 renumbered to **Phase 5**. Resolves the dependency
  open question: operator runs `npm publish` (I prep + hand over the command);
  skittership's GitHub repo is created + pushed. Phase 5 then consumes the
  published package.
- 2026-07-13 — Phase 3 done. Added `src/deprecate.js` + a guarded cleanup path to
  `skitterspec update`: detects leftover release tooling and removes it only on an
  interactive yes or `--remove-release-tooling`; non-TTY/`--yes` print a notice
  only (CI never mutates). Removal is scoped (prunes empty dirs, preserves custom
  `version`, CHANGELOG/RELEASES, and unrelated scripts). 11 new tests; `node
  --test` green (176).
- 2026-07-13 — Phase 2 done. Stripped all release tooling from skitterspec:
  deleted the commit skill/rule, both generators + `lib/`, `src/config.js`, and
  the release tests; removed the release config/flags/prompts from
  `src/{init,cli,prompts}.js`; dropped `commit`/`commit-messages.md` from
  `SKILLS`/`RULES`. `node --test` green (165). Deferred: two soft `/commit`
  suggestions in spec-go/spec-complete, and this repo's own dogfood migration →
  Phase 4.
- 2026-07-13 — Phase 1 done. Built `@skitterbyte/skittership` at
  `/Users/reubengreaves/code/skittership` (git-initialised, staged, not yet
  committed — left for review). 62 tests green via `node --test`. Deviations from
  the plan: (a) also added a `## Release tooling` CLAUDE.md section + asset (so a
  skitterspec+skittership user keeps the commit guidance skitterspec's Phase 2
  strip removes); (b) `migrateLegacyConfig` runs in **both** the CLI (before
  `loadConfig`) and `init()` top, so the CLI and direct-init paths both carry
  legacy values over.
