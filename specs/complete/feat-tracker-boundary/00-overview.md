---
github_identifier: "#63"
github_url: "https://github.com/SkitterByte/skitterspec/issues/63"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Tracker boundary: tell, don't track

> **Type:** Feature
> **Name:** feat-tracker-boundary (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-29)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-29
> **Area:** packages/provider-kit/src/{released,releases,doctor}.js, packages/sync-core/src/normalize.js, packages/{github,linear,azure-boards,jira}/src/{cli-sync,config,api}.js, packages/*/assets/{core,skills/spec-status,skills/spec-sync}, packages/linear/assets/core/ci-stages.md, .github/workflows/release.yml, scripts/, RELEASING.md, docs/*.html
> **Stack:** worktree

## Problem

The tracker integration has drifted from a one-way mirror into following a
ticket's whole life. It mints release objects, moves tickets up a deploy
ladder, validates env names against a pipeline, and reports when someone
moves a ticket's status by hand. None of that is about specs. A release and
a deploy describe what happens to a ticket after the spec is done, and a
status someone changed in the tracker is not something skitterspec did. Each
piece needs config, credentials in CI and its own failure modes, in all four
providers.

## Decisions

1. **Skitterspec tells the tracker about its own transitions, and nothing
   else.** Push sets status only when the repo's state changed since the last
   push, which the split state hash already does. A status changed in the
   tracker is never read back or acted on.
2. **The one release question skitterspec answers is "what is in this
   range".** It is the only part that needs spec knowledge, because the
   `Refs:` trailers are the only record. `spec-sync released <range> --json`
   is the output. Writing release, deploy or ticket-status values is the
   consumer's job, using their own tracker CLI or API. Rejected: a generic
   `set key=value` passthrough, which would be a tracker-write tool living
   inside a spec tool.
3. **`released --json` gains `spec` and `url` per ticket.** Both come from the
   stamped frontmatter, so no network call is needed, and a consumer can act
   without a second lookup. The change is additive. An unlinked ref keeps
   `spec: null`, never a guess.
4. **Removed:** `release create|deployed|complete`, the provider-kit release
   seam and its adapter ops, `releases.series` (envs, `deployedField`, npm),
   Linear's `stage` verb and `release.stages` in all four configs, and the
   state-drift half of `status` and `/spec-status`.
5. **Kept:** the read-only `list` (state aliases, `--state`, `--mine`,
   `--next`), because folder buckets lie on the base branch. Also kept: the
   description-edited warning, which protects content rather than status, and
   `release.ignorePaths`, which `released` uses.
6. **Breaking, so the removed verbs refuse.** `release` and `stage` exit 1
   with one line pointing at `released --json`. Leftover config keys are
   ignored, and `doctor` names them as unused without failing. Each affected
   provider takes a major version. Rejected: a silent exit 0, which would let
   a pipeline go on believing it mirrors deploys.
7. **This repo dogfoods the consumer side.** `release.yml`'s mirror step is
   replaced by `scripts/mirror-deployed.cjs`, which pipes `released --json`
   into `gh` to set the board's Deployed field. It is still never fatal.
8. **`feat-tracker-releases` is superseded.** It would have built Linear
   Releases on the seam this spec removes, so it is cancelled.

## Solution overview

- The spec lifecycle pushes status at its own transitions (unchanged).
- CI computes a range (`git describe --tags --abbrev=0 --match '<prefix>*'
  <tag>^..<tag>`) and runs `spec-sync released <range> --json`. From there
  the consumer's script does whatever their tracker needs.
- Everything that moved or read a ticket's state after `complete` is gone.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync released --json` (+`spec`, `url` per ticket) |
| CLI command | remove | `spec-sync release create\|deployed\|complete` (GitHub, Azure) |
| CLI command | remove | `spec-sync stage` (Linear) |
| CLI command | update | `spec-sync status`: no state-drift report |
| Skill | update | `/spec-status` (all four): drift = content only |
| Config key | remove | `releases.series`, `releases.deployedField`, `release.stages` |
| Adapter op | remove | `releaseFind/Create/Attach/Stage/Complete` |
| CI | update | `release.yml` mirror step → `scripts/mirror-deployed.cjs` |
| Package | update | major bump: skitterspec-github, -linear, -azure-boards, -jira |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `released --json` names the spec | ✅ | [01-released-names-spec.md](01-released-names-spec.md) |
| 2 | Dogfood script, then remove release objects | ✅ | [02-remove-release-objects.md](02-remove-release-objects.md) |
| 3 | Remove the stage ladder | ✅ | [03-remove-stage-ladder.md](03-remove-stage-ladder.md) |
| 4 | Remove state drift | ✅ | [04-remove-state-drift.md](04-remove-state-drift.md) |
| 5 | Docs and dist | ✅ | [05-docs-and-dist.md](05-docs-and-dist.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-29 | Ready | backlog | Reuben Greaves |
| 2026-10-29 | In Progress | in-progress | Reuben Greaves |
| 2026-10-29 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-29 — Spec created. Supersedes `feat-tracker-releases`.
- 2026-10-29 — Phase 1: `listSpecs` takes `{ urls: true }` rather than always
  carrying `url`, so `linked --json` and every other listing keep their shape.
- 2026-10-29 — Phase 2: the release verbs had two more callers than the spec
  named — `approve-release.cjs` and the hourly `reconcile-releases.yml`. The
  script gained `--reconcile` (newest tag per package, Published when live on
  npm) to keep both. It writes the board over GraphQL rather than
  `gh project item-edit`, which needs three ids looked up first.
- 2026-10-29 — Phase 2: the `/spec-cancel feat-tracker-releases` task moved to
  phase 5. It changes another spec, so it runs once this one lands.
- 2026-10-29 — Phase 2: also removed Azure's `fieldAllowedValues` and GitHub's
  `IMPOSSIBLE_OVER_MCP`, both used only by the release verbs.
- 2026-10-29 — Phase 3: a tracker state that was a ladder rung now reads as
  unmapped, which is position and not drift. A project that wants it read as
  `complete` lists it as a `states.complete` alias, which `feat-spec-list-board`
  already supports. Also removed `releases` from this repo's own
  `github.config.json`, which phase 2 left behind.
- 2026-10-29 — Phase 4: Linear's assignee drift line stays. The assignee is a
  field the repo owns and push restores it, so it is not a status read-back.
  The Linear `/spec-status` now says so.
- 2026-10-29 — Phase 5 widened at the user's request to every doc surface,
  with a final grep for the removed terms.
- 2026-10-29 — Phase 5: phase 1 had missed Jira's `released`. An earlier
  grep had skipped the file as binary. It now names the spec and url like the
  others. `mirror-deployed.cjs` now resolves its token the way `spec-sync` does,
  so `npm run approve` on a laptop keeps marking Published. This repo's
  `specs/.core` was Linear-era (Linear SETUP, the ladder guide) and is now
  resynced from the GitHub package. The final sweep leaves only deliberate
  "retired" notes and the `docs-claims` allowlist reasons.
- 2026-10-29 — `feat-tracker-releases` cancelled (8616a38f). Its branch is
  pushed as the record; its one non-release fix landed as
  `bug-linear-http-error-body`.
- 2026-10-29 — Completed; all phases done, tests green. Known gap: the
  `mirror-deployed.cjs` board write is unproven until the next tag push.
