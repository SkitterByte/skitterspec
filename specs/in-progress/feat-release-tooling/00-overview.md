# Configurable changelog/release tooling + guided install CLI

> **Type:** Feature
> **Status:** In Progress — Phases 1–2 done; Phase 3 next
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-06-30
> **Area:** `bin/skitterspec.js`, `src/cli.js`, `src/init.js`, `assets/scripts/**`, `assets/rules/commit-messages.md`, `assets/skills/commit/SKILL.md`, `README.md`, `assets/claude-md-section.md`, `package.json`, `test/**`

## Problem

`/commit` can write `Release-Note:` footers, but skitterspec ships nothing that
consumes them. We have battle-tested generators (`generate-changelog.ts`,
`generate-releases.ts`, `git-commits.ts`) that turn conventional commits +
footers into a dev-facing `CHANGELOG.md` and a user-facing `RELEASES.md` — but
they're TypeScript (need `tsx`/`vitest`/`pnpm`) and hardcoded to one project
("FF CSC Requisitions", a fixed scope→area map, fixed filenames). skitterspec is
a zero-dep CommonJS package that copies plain files into *any* repo, so those
scripts can't ship as-is. We also want `init` to stop being a silent
flag-only copy and instead **guide** the user through which parts to enable
(changelog, release notes, filenames, version-bump wiring), recording the
choices so generation is opt-in and reproducible.

## Decisions

1. **Port the scripts to zero-dep Node JS** (CommonJS `.js`), tests re-expressed
   as `node:test`. Rejected shipping the `.ts` + `vitest` as-is (would force a
   TS toolchain on every consumer and break "works anywhere") and "ship TS with
   a configurable runtime" (still assumes TypeScript).
2. **Version-bump trigger.** `/commit` writes footers per commit; the two files
   regenerate over *commits-since-last-tag* at `npm version` via an
   (opt-in) `version` script. Manual `changelog`/`releases` commands also
   exist. Rejected per-commit regeneration (noisy, redundant, fights the
   since-last-tag batch design).
3. **Config at repo root: `skitterspec.config.json`.** Machine-readable JSON the
   JS generators read via `JSON.parse(cwd)` and the CLI writes/updates. Rejected
   a `.claude/`-nested file and a `package.json` key (latter couples to npm and
   assumes every consumer is a Node package).
4. **Interactive CLI built on the `prompts` (terkelg) library** — a runtime
   dependency, a deliberate departure from zero-dep, chosen over `@clack/prompts`
   (ESM-only, friction with the CJS CLI) and `enquirer` (heavier than needed).
   Flags mirror every prompt; non-TTY / `--yes` uses flags+defaults and never
   hangs CI.
5. **Genericise the hardcoded bits into config:** scope→area map (default `{}` →
   Title-Case fallback), product name (default = repo dir name), and the two
   filenames (`CHANGELOG.md` / `RELEASES.md`). The `commit-messages.md` rule and
   `/commit` skill drop the FF CSC specifics and point at config; runtime is
   `node`, not `tsx`/`pnpm`.

## Solution overview

**Config shape** (`skitterspec.config.json`, repo root):
```json
{
  "version": 1,
  "changelog": { "enabled": true, "file": "CHANGELOG.md" },
  "releases":  { "enabled": true, "file": "RELEASES.md",
                 "productName": "<repo name>", "scopeAreas": {} },
  "versionHook": true
}
```

**Shipped assets** (copied into the consumer's `scripts/` only when enabled):
`scripts/lib/git-commits.js`, `scripts/generate-changelog.js`,
`scripts/generate-releases.js`. Generators load config from cwd, falling back to
documented defaults when absent.

**Guided `init`** (TTY only; non-TTY/`--yes` → flags+defaults):
1. Enable changelog generation? → filename
2. Enable user-facing release notes? → filename, product name (scope→area map
   edited later in config)
3. Wire the version-bump hook into `package.json`? (offered only if a
   `package.json` exists)

`init` then: writes/merges `skitterspec.config.json`; copies the script assets
for enabled features; idempotently adds `version` + `changelog`/`releases`
(+`:retro`) npm scripts when the hook is opted in (never clobbers an existing
custom `version` script without `--force`). Re-running reads existing config and
pre-fills answers; `update` re-syncs scripts without touching config or specs.

**Out of the box this remains a "drop into any repo" tool** — no `tsx`, no
`vitest`, no `pnpm`; everything runs on Node 18+.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Port lib + generators to zero-dep JS (config-injected, genericised) + ported tests | ✅ | [01-port-generators.md](01-port-generators.md) |
| 2 | Config schema + loader wired into the generators | ✅ | [02-config-loader.md](02-config-loader.md) |
| 3 | Interactive install CLI: prompts, flags, conditional copy, version-hook wiring, update | ⬜ | [03-install-cli.md](03-install-cli.md) |
| 4 | Docs + rule/skill genericisation + dog-food symlinks | ⬜ | [04-docs-and-dogfood.md](04-docs-and-dogfood.md) |

## Open questions

- [ ] None — design agreed in grilling (script form, trigger, config store,
      prompt library) on 2026-06-30.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-06-30 | Draft | backlog | Reuben Greaves |
| 2026-06-30 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-06-30 — Spec created. Decisions locked: zero-dep JS port; version-bump
  trigger; root `skitterspec.config.json`; `prompts` (terkelg) interactive CLI;
  genericise the FF CSC-specific hardcoding into config.
- 2026-06-30 — Phase 2 done. Config loader in `assets/scripts/lib/config.js`
  (`loadConfig`/`DEFAULT_CONFIG`/`SCHEMA_VERSION`), re-exported by `src/config.js`
  for the CLI — single implementation, shipped with the generators, no
  back-dependency on the package. Both generator CLIs now `loadConfig()` and feed
  filename/`productName`/`scopeAreas` through; disabled features no-op (exit 0),
  malformed JSON errors (exit 1), unknown keys ignored. 48 `node:test` cases green.
- 2026-06-30 — Phase 1 done. Ported all three files to CommonJS under
  `assets/scripts/` (`lib/git-commits.js`, `generate-changelog.js`,
  `generate-releases.js`); 38 `node:test` cases green. Genericising made the
  scope→area map a trailing arg to `resolveArea`/`parseReleaseNote` (default
  `{}`), turned the header into `defaultReleasesHeader(productName,
  changelogFile)`, and gave each IO entrypoint an options bag for the Phase 2
  config loader. CLI guard is `require.main === module`. Tests pass an explicit
  area map since the shipped default is empty. Removed the throwaway `/scripts`
  reference copies of the source TS.
