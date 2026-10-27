---
github_identifier: "#46"
github_url: "https://github.com/SkitterByte/skitterspec/issues/46"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Self-healing release mirror — `release reconcile`

> **Type:** Feature
> **Name:** feat-release-reconcile
> **Status:** In Progress — Phase 1 (started 2026-10-27)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-27
> **Area:** packages/provider-kit/src/releases.js, packages/github/src/api.js, packages/github/src/cli-sync.js, packages/github/assets/core/, .github/workflows/
> **Stack:** worktree

## Problem

The board's **Deployed** field only moves to `Published` when `npm run approve`
runs, because the mirror verbs live in that script's success path. Approving on
the npm website — the normal flow in practice — publishes the package and tells
the board nothing, so issues sit at `Staged` forever: today nine releases across
three series are live on npm while their GitHub releases still read
`stage=staged`. Two more gaps compound it: approving only the newest of several
staged versions leaves the superseded tags' issues at `Staged` even though their
commits shipped, and a batch tag push (>3 tags, no GitHub events) means CI never
mirrored some tags at all — jira and azure-boards have no GitHub releases.
This needs to ship in the provider, documented, so any project using GitHub
sync with npm packages gets the same self-healing.

## Decisions

1. **Ships as a provider verb, not a repo script**: `spec-sync release
   reconcile [--apply] [--json]` on the shared release seam
   (`provider-kit/src/releases.js`), dry-run by default like the other release
   verbs. Rejected: a `scripts/`-local orchestrator — helps nobody else, and
   the explicit requirement is that other GitHub+packages adopters pick this up
   from the docs.
2. **Liveness is a built-in npm registry check.** Each `releases.series` entry
   gains `"npm": "@scope/name"`; the engine GETs
   `https://registry.npmjs.org/<encoded-name>` once per series and reads the
   `versions` keys. No npm CLI in the workflow. Rejected: a configured probe
   command — every adopter writes one and installs its toolchain; revisit only
   if a non-npm registry turns up.
3. **Absence means "not yet", never "failed"** (negative-checks rules 1 & 4,
   and the known npm publish lag). A version missing from the registry keeps
   the release where it is, silently. A package-level 404, a network error, or
   a series with no `npm` key is a cannot-tell: one line, series skipped,
   exit 0. Reconcile never exits non-zero for "nothing moved".
4. **Containment counts.** A release moves when its own version *or any newer
   version in the same series* is live (semver compare on the part after
   `tagPrefix`) — the older tag's commits shipped inside the newer version.
   This is what un-strands superseded staged tags; jira correctly stays
   `Staged` because nothing newer is live.
5. **The move target is the series' last env** (the final rung of `envs`),
   followed by `release complete`. Intermediate envs are not probeable from a
   registry and stay manual/CI-driven.
6. **Ascending order, one "Latest".** Releases are processed oldest→newest per
   series; only the newest live release in a series completes with
   `make_latest: true`, older ones pass `false` — a backfilled old release must
   not steal GitHub's "Latest" badge. `releaseComplete` grows an options arg:
   `releaseComplete(release, { latest })`.
7. **Only marked releases are touched.** Reconcile enumerates via a new
   feature-detected adapter op `releaseList()` and considers only releases
   carrying the `<!-- skitterspec:release v1 stage=… -->` marker. Hand-made
   releases are never read or written.
8. **Backfill is bounded.** A pushed tag with no GitHub release gets
   `release create --stage staged` first, then probes like the rest — but only
   tags semver-newer than the series' newest existing release; a series with
   *no* releases backfills its newest tag only. Rejected: all tags — skitterspec
   alone has ~55 historical versions that would become ~55 noise releases.
9. **The workflow is documented, and this repo runs it.** A copy-paste
   `reconcile-releases.yml` (hourly cron + `workflow_dispatch`,
   `fetch-depth: 0`, classic PAT secret — Actions' `GITHUB_TOKEN` cannot write
   a user-owned Projects v2 board) goes in the provider docs; this repo adds
   the real one using `SKITTERSPEC_GITHUB_TOKEN`.
10. **`npm run approve`'s mirror step stays.** It is instant where reconcile is
    hourly; reconcile is the safety net behind it, web approvals, and missed CI
    runs alike.

## Solution overview

`release reconcile` runs per configured series: list this repo's releases
(adapter `releaseList()`), keep those with the skitterspec marker, parse
`tag → (series, version)` by `tagPrefix`. Backfill: enumerate `git tag
--list '<prefix>*'`, create missing releases inside the bound (Decision 8).
Fetch the series' npm doc once; compute the set of live versions. For each
marked release still short of the final env, ascending: if its version is live
or contained (Decision 4), run the existing `deployed`-to-final-env path over
its own tag range, update the stage marker, then `complete` with `latest` only
on the series' newest live release. Dry run prints the same plan without
writes. Output one line per release — `moved` / `kept (not on npm yet)` /
`skipped (<why>)` — and `--json` mirrors it.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync release reconcile [--apply] [--json]` |
| Config key | add | `releases.series[].npm` (github.config.json) |
| Seam | update | `provider-kit/src/releases.js` (+reconcile, ordering, latest) |
| Adapter op | add | `releaseList()` (feature-detected) |
| Adapter op | update | `releaseComplete(release, { latest })` |
| CI workflow | add | `.github/workflows/reconcile-releases.yml` (this repo) |
| Docs | update | `github.config.md`, `SETUP.md`, spec-sync `SKILL.md` release section |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Reconcile verb — move staged releases that are live on npm | ✅ | [01-reconcile-verb.md](01-reconcile-verb.md) |
| 2 | Backfill missing releases for pushed tags | ✅ | [02-backfill-missing-releases.md](02-backfill-missing-releases.md) |
| 3 | Workflow + docs; clear this repo's backlog | ⬜ | [03-workflow-and-docs.md](03-workflow-and-docs.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-27 | Ready | backlog | Reuben Greaves |
| 2026-10-27 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-27 — Spec created.
- 2026-10-27 — Phase 1: `releases.series[].npm` needed explicit validation in
  `packages/github/src/config.js` — the loader normalises series entries, so an
  undeclared key was silently stripped. Added as a task and done.
- 2026-10-27 — Phase 1: reconcile's behavioural tests live in
  `packages/github/test/release.test.js` (the established end-to-end harness —
  real repo, fake adapter, injected fetch); the kit's new
  `test/releases.test.js` covers the pure pieces. Slight re-split from the
  plan, same coverage.
- 2026-10-27 — Phase 2: a series without an `npm` name skips backfill too, not
  just the move — reconcile's per-series opt-in is the `npm` key, and creating
  releases it can never probe would leave them stranded by design. Also: the
  backfill candidate set excludes any tag with an existing release (marked or
  not), so a hand-made release's tag is never recreated.
- 2026-10-27 — Noted in passing: `env-review-reader.test.js` › "the alternates
  are real alternatives" failed repeatedly in this worktree, then passed in the
  same worktree later — environment-dependent (LAN/tailnet address ranking),
  not related to this spec.
