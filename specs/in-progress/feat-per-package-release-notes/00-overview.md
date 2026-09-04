---
linear_identifier: "SKS-66"
linear_url: "https://linear.app/skitterbyte/issue/SKS-66/per-package-release-notes"
---

# Per-package release notes

> **Type:** Feature
> **Name:** feat-per-package-release-notes (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** scripts/release-notes.js, scripts/release.js, RELEASES.md, CHANGELOG.md, package.json
> **Stack:** worktree

## Problem

Every user-facing commit carries a `Release-Note:` footer — the
`commit-messages.md` rule requires it, and eleven accumulated in the
16.8.0 / 10.7.0 release alone. Nothing consumes them. `RELEASES.md` and
`CHANGELOG.md` both open with *"Historical — no longer maintained"*, recording
the single-package `1.0.x` era and nothing since.

So the discipline is being paid for and none of the benefit collected: contributors
write user-facing notes into commits that no reader will ever see.

The generator was not lost, only **extracted**. `@skitterbyte/skittership@1.1.0`
is a devDependency here, `skittership.config.json` is present with
`releases.enabled: true`, and `assets/scripts/generate-releases.cjs` ships inside
it. What is missing is the monorepo wiring.

## Decisions

1. **Two files, scoped by changed paths** — `RELEASES-skitterspec.md` and
   `RELEASES-skitterspec-linear.md`. Rejected: one shared file (a change to
   `packages/common` ships in both distributions and would be listed twice with
   nothing saying why) and base-only (silently drops every Linear-only change).

2. **Attribution is by source package, derived from the build.**
   `scripts/build-dist.js` is the authority: the base vendors `common`; the
   superset vendors `common` + `sync-core` + `linear`. So a commit touching
   `packages/common/**` belongs to **both** release notes; one touching
   `packages/linear/**` or `packages/sync-core/**` belongs to the superset only.
   Rejected: guessing from the commit's `scope`, which is a human label and
   already drifts from the tree.

3. **Only commits carrying a `Release-Note:` footer are attributed.** That is
   already the rule for appearing in release notes, and it shrinks the problem:
   `docs`, `chore` and test-only commits never need a package decided for them.

4. **The shipped generator is installed managed and left unmodified.**
   `skittership update` writes `scripts/generate-releases.cjs` and its `lib/`;
   this repo adds a separate `scripts/release-notes.js` driver that requires the
   installed file's exported pure functions (`parseReleaseNote`,
   `renderReleasesSection`, `upsertReleasesSection`, `bucketFor`, `resolveArea`)
   and supplies its own commit selection. Rejected: editing the installed
   generator — the next `skittership update` would report it customized and
   decline to update it, freezing a fork.

5. **Tag series, not `git describe`.** The generator's `lib/git-commits.cjs`
   walks `git describe --tags`, which in this repo picks whichever of the two
   interleaved series (plus legacy `v*`) happens to be nearest. The driver
   selects `<pkg>@<prev>..<pkg>@<current>` explicitly instead.

6. **Driven from `release.js`, not the npm `version` hook.**
   `skittership.config.json` sets `versionHook: true`, but `release.js` edits
   `package.json` directly (pnpm has no workspace-scoped `version` verb), so no
   lifecycle hook fires. The notes step joins the plan as a `[local]` step before
   the release commit, so the generated file is committed with the version bump.

## Solution overview

`scripts/release-notes.js <package> <version>`:

1. Resolve the package's previous tag from its own series
   (`git tag --list '<pkg>@*'`, semver-sorted), and the range to `HEAD`.
2. `git log <prev>..HEAD --no-merges` with `--name-only`, keeping commits that
   carry a `Release-Note:` footer.
3. Keep those whose changed paths touch a source package that feeds this
   distribution (Decision 2).
4. Render with the installed generator's pure functions and upsert the section
   into `RELEASES-<pkg>.md`.

`release.js` gains one `[local]` step per release, before the commit, so the
notes land in the release commit itself.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `scripts/release-notes.js <pkg> <version>` |
| CLI command | update | `release.js` — a notes step before the release commit |
| Docs | add | `RELEASES-skitterspec.md`, `RELEASES-skitterspec-linear.md` |
| Docs | update | `RELEASES.md`/`CHANGELOG.md` point at the new files |
| Config | add | `scripts/generate-releases.cjs` + `lib/` installed by skittership |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Commit selection and package attribution | ✅ | [01-attribution.md](01-attribution.md) |
| 2 | Render, wire into release.js, backfill | ⬜ | [02-render-and-wire.md](02-render-and-wire.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | Ready | backlog | Reuben Greaves |
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Spec created.
- 2026-09-04 — Phase 1: `skittership update` wired a `version` hook and `changelog`/`releases` npm scripts alongside the generators. All reverted — the hook can never fire (the root `preversion` guard refuses root versioning) and the scripts would run the single-series generator Decision 5 rejects.
- 2026-09-04 — Phase 1: three of eighteen footer-carrying commits attribute to no package (two website, one release tooling); none should have carried a footer. Added a Phase 2 task to **report** orphans rather than drop them silently.
