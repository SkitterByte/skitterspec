# Monorepo + ticketing-provider extraction, re-derived onto `main`

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-07-14)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-14
> **Area:** repo topology (flat → workspaces), `src/sync/*`, `src/cli.js`,
> `src/init.js`, `src/env/resolve.js`, `assets/skills/*`, `assets/core/linear.config.*`,
> `assets/rules/spec-planning.md`, `package.json`, new `packages/*` + `scripts/*`
> **Stack:** worktree

## Problem

The Linear/ticketing sync is baked into the base package — Linear-only skills, a
`src/sync/` engine, and "if Linear is configured" passages woven into the shared
`/spec` and `/spec-go`. We want the base to be a clean, tracker-free filesystem
workflow with ticketing providers layered on top as swappable packages (Linear
now, Jira likely next).

This work was already built and completed on branch
`feat/extract-ticketing-provider` (see `specs/complete/feat-extract-ticketing-provider/`
there) — a workspace monorepo with `common` / `sync-core` / `linear` packages,
generic seams + a build-time compose step, and two published distributions
(`@skitterbyte/skitterspec` base v2 + `@skitterbyte/skitterspec-linear` superset).
**But that branch forked before `main` extracted the commit/release tooling into
the standalone `@skitterbyte/skittership` package**, so it still drags the old
release tooling around inside `packages/common`, and `main` has since diverged
structurally (release tooling removed, `deprecate.js` added, `skittership`
dogfooded). A straight rebase would be a large, conflict-heavy fight.

Decision (confirmed): **re-derive the extraction fresh on top of current `main`**,
porting the proven code from `feat/extract-ticketing-provider` and *not*
re-introducing the release/commit tooling `main` already removed.

## Decisions

1. **Re-derive onto `main`, don't rebase.** New branch off `main`; re-apply the
   monorepo conversion + Linear extraction + seams/compose + distributions as clean
   commits. The removed release tooling is excluded by construction. The completed
   `feat/extract-ticketing-provider` branch is the **reference to port from**.
2. **The base is already release-tooling-free — keep it that way.** `main` moved
   the changelog/release generators, the `commit` skill, and the `commit-messages`
   rule into `@skitterbyte/skittership`. The monorepo's `packages/common` therefore
   ships **none** of them: no `assets/scripts/*`, no `commit` skill, no
   `commit-messages.md`, no `skitterspec.config.json` / release-config schema, and
   no release logic in `init.js` / `cli.js` / `prompts.js`. (This supersedes the
   old spec's Decision 2, which kept release tooling internal.)
3. **Preserve `main`'s additions.** Carry `src/deprecate.js` + its `update` wiring
   into `packages/common` (it helps users off the *old* bundled tooling). Keep the
   repo's own **skittership dogfooding at the monorepo root** — devDependency
   `@skitterbyte/skittership`, the `scripts` symlink, `skittership.config.json`, and
   the `changelog`/`releases`/`version` npm scripts. Published distributions depend
   only on `prompts`; they never ship or depend on skittership.
4. **Everything else matches the completed extraction.** `sync-core` (neutral
   engine) + `linear` (adapter, private, named `@skitterbyte/skitterspec-provider-linear`);
   generic seams (`spec-tracker-link`, `spec-go-pull`) + `scripts/compose.js`;
   provider-neutral branch naming in `env.config.json` (`branch.pattern` /
   `branch.identifierField`); `scripts/build-dist.js` composing self-contained
   distributions; `init.js` **asset-driven** (installs what it bundles).
5. **Distributions & versions.** `@skitterbyte/skitterspec` → **2.0.0** (breaking:
   Linear removed from the base; `main` is currently 1.0.1). `@skitterbyte/skitterspec-linear`
   → **1.0.0** (superset). `MIGRATION.md` covers the split, but the **Linear section
   stays light** — Linear sync has effectively zero adoption, so there's no real
   migration burden and no deprecation flow for `linear.config.json`.

## Solution overview

Target layout (identical to the completed extraction), built on `main`'s
release-tooling-free base:

```
packages/
  common/          private — neutral lifecycle skills (seam markers), install
                   CLI (release-free, deprecate.js kept), rules, specs/.core
  sync-core/       private — provider-neutral 3-way engine (ported as-is)
  linear/          private (@skitterbyte/skitterspec-provider-linear) — adapter:
                   mcp.js, config.js, 3 sync skills, seam fragments, linear.config.*
  skitterspec/         published — base dist (compose common, seams empty). v2.0.0
  skitterspec-linear/  published — superset (compose + linear vendored). v1.0.0
scripts/           compose.js + build-dist.js (+ tests)
```

**Port mechanics per file class:** `sync-core`, `linear`, `scripts/compose.js`,
`scripts/build-dist.js`, the seam-marked shared skills, the neutral `env/resolve.js`
changes, the distributions, and `MIGRATION.md` port **verbatim** from
`feat/extract-ticketing-provider`. The reconciliation surface is small and lives
in `packages/common/src`:

- `init.js` = `main`'s (release-free, `deprecate`-wired) **+** the asset-driven
  skill/rule/core discovery. Base assets carry no `linear.config.*` / `commit` →
  discovery yields the right set automatically.
- `cli.js` = `main`'s **minus** the `spec-sync` dispatch + Linear help (extracted
  to the `linear` package), matching the completed base CLI.
- `prompts.js` / `config.js` = `main`'s (already release-free); drop nothing extra.
- `env/resolve.js` = `main`'s **+** the branch's provider-neutral branch naming
  (remove `linkLinear` / `loadLinearConfig`; add `branch.pattern` + `{identifier}`).

## Phases

Each phase lives in its own file. Status: ⬜ not started · 🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Monorepo skeleton on `main`; carve release-free `common` + `sync-core` | ⬜ | [01-monorepo-skeleton.md](01-monorepo-skeleton.md) |
| 2 | Extract the Linear adapter into `packages/linear` | ⬜ | [02-linear-adapter.md](02-linear-adapter.md) |
| 3 | Generic seams + compose + neutral branch naming | ⬜ | [03-generic-seams.md](03-generic-seams.md) |
| 4 | Distributions, rename/v2, migration, asset-driven init | ⬜ | [04-distributions-migration.md](04-distributions-migration.md) |

## Open questions

- [x] **Fate of `feat/extract-ticketing-provider`:** delete it once this lands on
      `main` and is verified. It's only kept until then as the **port source** (this
      spec ports code from it; it's never git-merged). Deleting the branch is the
      final task of Phase 4.
- [x] **Linear-config deprecation on update:** none needed. Linear sync has
      effectively zero adoption (author-only, never released for real use), so
      `deprecate.js` gains **no** Linear-config removal flow and `MIGRATION.md` keeps
      the Linear section light. A stray `linear.config.json` is inert without the
      provider installed and is left to the user.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-14 | Draft | backlog | Reuben Greaves |
| 2026-07-14 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-14 — Spec created. Supersedes `feat-extract-ticketing-provider` (built on
  a pre-skittership base). Confirmed via grill: re-derive onto `main` (not rebase),
  drop all commit/release tooling (already extracted to `@skitterbyte/skittership`),
  preserve `main`'s `deprecate.js` + skittership dogfooding, otherwise port the
  proven extraction verbatim.
- 2026-07-14 — Open questions resolved: (1) delete `feat/extract-ticketing-provider`
  after this lands + verifies (kept only as the port source; final Phase 4 task);
  (2) no Linear-config deprecation flow — near-zero adoption, so `MIGRATION.md`'s
  Linear section stays light and a stray `linear.config.json` is left to the user.
