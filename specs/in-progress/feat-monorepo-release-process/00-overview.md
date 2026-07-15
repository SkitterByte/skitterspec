# Monorepo release/publish process

> **Type:** Feature
> **Status:** In Progress — Phase 2 done (2026-07-15)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-14
> **Area:** scripts/release.js, package.json (root), RELEASING.md, packages/skitterspec, packages/skitterspec-linear
> **Stack:** worktree

## Problem

The repo became an npm-workspaces monorepo (private root + two publishable
distributions, `@skitterbyte/skitterspec` and `@skitterbyte/skitterspec-linear`)
but never gained a release/publish *process*. The distributions build correctly
(`scripts/build-dist.js`, guarded, smoke-tested) — but there is no defined way to
version, tag, order, and publish them. Consequences already felt: a stray
`npm version` bumped the **private root** (`0.0.0 → 1.0.0`) instead of a package;
`skitterspec@2.0.0` is built but unpublished (npm still serves `1.0.1` with the
old release tooling); `skitterspec-linear@1.0.0` has never been published at all.
There is no `RELEASING.md`, no tag scheme, and the leftover single-package-era
root `version`/`changelog`/`releases` scripts point at the private `0.0.0` root —
the exact footgun vector.

## Decisions

1. **Independent per-package versioning.** Each published package versions, tags,
   and publishes on its own cadence (base is `2.0.0`, linear `1.0.0`). Rejected
   locked/unified versioning — it would force a release of one package for every
   change to the other. A bump touches exactly the package that changed.
2. **Scope: the release *process* only.** This spec covers versioning, tags,
   publish order/commands, a `RELEASING.md`, and the guard/hygiene to make the
   sanctioned path the only path. **Automated CHANGELOG/RELEASES generation is
   explicitly out of scope** and deferred to a later spec. Consequently
   **skittership is untouched** — it is only relevant to changelog generation,
   which we are deferring.
3. **A thin `scripts/release.js` + `RELEASING.md`.** Encode the sequence and the
   tag scheme in a small zero-dep script (matching the repo's script ethos) so a
   release isn't hand-typed. Rejected doc-only manual steps — every release would
   be hand-typed, which is exactly where the wrong-package bump happened.
4. **Tag scheme `name@version`** (short, unscoped): `skitterspec@2.0.0`,
   `skitterspec-linear@1.0.0`. The constant `@skitterbyte/` scope adds no
   information; the short form matches the package directory names. Existing flat
   `v0.1.0`/`v1.0.0`/`v1.0.1` tags stay as history.
5. **Plan-by-default publish boundary.** A bare `release.js <pkg> <bump>` run
   **prints the full plan and changes nothing** (dry-run). It performs the local
   bump + commit + tag only on confirmation, and runs `npm publish` only with an
   explicit `--publish` flag. It **never pushes git** — it prints
   `git push --tags` for the operator. This encodes "I prep, you publish" in the
   tool and keeps the whole thing unit-testable with no side effects. The scoped
   first publish passes `--access public`.
6. **Neutralize the stale root scripts.** Remove the root `version`,
   `changelog`, `releases`, `changelog:retro`, `releases:retro` scripts and add a
   `preversion` guard that refuses `npm version` at the private root, pointing at
   `release.js`. `build` and `test` stay. Re-introducing changelog generation
   (per package) is the later deferred spec's job.

## Solution overview

`node scripts/release.js <package> <bump|version> [--publish]`

- **`<package>`** — `skitterspec` or `skitterspec-linear` (resolves to
  `packages/<package>`); unknown names are refused.
- **`<bump>`** — `patch` | `minor` | `major` | an explicit `x.y.z`.
- **Default (no confirm/flag): plan only.** Reads the package's current version,
  computes the next, and prints the ordered steps + exact commands, touching
  nothing. Emits a structured plan (the unit-test seam).
- **Execute (confirmed):** `npm version --no-git-tag-version -w <pkg> <bump>` →
  `git add` the package.json → `git commit` → `git tag <name>@<version>`.
  Guards: refuse a dirty tree, an already-existing tag, or an unknown package.
- **`--publish`:** `npm publish -w @skitterbyte/<pkg> --access public` (prepack
  runs `build-dist.js`, assembling the self-contained tree). **Never** runs
  `git push`; prints `git push --tags` (and the pushed-branch reminder).

Publish order is independent — publish only what changed; when both go out
together, base before linear by convention. The real first releases
(`skitterspec@2.0.0`, `skitterspec-linear@1.0.0`) are the operator's `--publish`
step; the spec proves the tool by generating and verifying their **plans**.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The `release.js` script (plan/execute/publish, guards) | ✅ | [01-release-script.md](01-release-script.md) |
| 2 | Root hygiene + `RELEASING.md` + first-release handoff | ✅ | [02-root-hygiene-and-doc.md](02-root-hygiene-and-doc.md) |

## First-release handoff (operator, post-spec)

Publishing is outward/irreversible — left to the operator per "I prep, you
publish." After this spec lands, cut the first releases under the new scheme:

- `node scripts/release.js skitterspec 2.0.0 --publish` (already at `2.0.0`; this
  tags `skitterspec@2.0.0` and publishes over npm's `1.0.1`).
- `node scripts/release.js skitterspec-linear 1.0.0 --publish` (first-ever
  publish; `--access public`).
- `git push --tags` afterwards.

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-14 | Draft | backlog | Reuben Greaves |
| 2026-07-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-14 — Spec created.
- 2026-07-15 — Moved to in-progress on worktree `feat/monorepo-release-process`; started Phase 1.
- 2026-07-15 — Phase 2 done: removed the five stale root scripts, added
  `release` + a `preversion` guard (`scripts/no-root-version.js`), wrote
  `RELEASING.md`, and verified both first-release dry-run plans. The
  README/CONTRIBUTING link task was skipped — neither file exists at the root.
  3 new tests; 213 total green. Both phases now done — ready for `/spec-complete`.
- 2026-07-15 — Phase 1 done (`scripts/release.js` + 15 tests; 210 total green).
  Deviation from Decision 5's "strictly greater": the version guard rejects only
  a **downgrade** and **allows an equal target** (with bump/commit skipped), so a
  first release of a version already in package.json — `skitterspec 2.0.0` — works;
  `npm version` also refuses an unchanged version. Duplicate protection is the
  tag-existence guard.
