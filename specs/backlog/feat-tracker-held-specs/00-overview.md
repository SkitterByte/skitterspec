---
github_identifier: "#123"
github_url: "https://github.com/SkitterByte/skitterspec/issues/123"
---

# Tracker-held dormant specs — the library-checkout model

> **Type:** Feature
> **Name:** feat-tracker-held-specs (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Draft — spike first; build phases follow its result
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-11-06
> **Area:** packages/{github,linear,jira,azure-boards}/src (round-trip read/write), packages/sync-core, packages/common/assets/skills (spec, spec-start, spec-complete), packages/common/src/env (resolve.js `specOnForkPoint`), scripts/docs-freshness.js
> **Stack:** worktree
> **Docs:** none: phase 1 is a spike and phase 2 a design; pages are named when build phases are written
> **Origin:** follow-up from `feat-pr-landing` (#106); revisits `feat-tracker-owns-status` (#93) Decision 1
> **Next spec:** none — last of the PR-mode follow-ups (after [`feat-rolling-base`](../feat-rolling-base/00-overview.md) (#113) → [`feat-hotfix-to-master`](../feat-hotfix-to-master/00-overview.md) (#118))

## Problem

In PR mode a spec document cannot reach the base branch without a PR, so
authoring a spec (`/spec`) is a PR of its own; `feat-pr-landing` worked around
it with `land.specDocs` (`trunk` needs direct push for docs; `branch` hides the
backlog until the work lands). Folder buckets are also only true on the branch
you stand on. A **library-checkout** model removes both: dormant specs (backlog,
draft) live in the tracker; `/spec-start` checks the spec out into the worktree
as the branch's first commit; in flight nothing changes (repo wins, one-way
push, review pages, gate); `/spec-complete` moves it to `specs/complete/` on the
completing PR, so the code repo keeps a greppable archive.

## Decisions

1. **Tracker mode only.** Without a provider, specs stay on the filesystem and
   trunk-based exactly as today (the tier split agreed 2026-11-06).
2. **Spike before design.** The ranked risk is round-trip fidelity — a spec
   written to a ticket and read back must be byte-equivalent markdown (Jira's
   ADF is lossy). No design work until phase 1 says which providers can hold a
   spec.
3. **Waits for #93 to land.** It partly reverses #93 Decision 1 ("rejected:
   tracker-only specs"), which rejected tracker-only specs *in flight*; this
   holds only *dormant* ones. Reconcile through `/spec-review` on #93 if #93 is
   still open when this starts.
4. **Native automations stay in view.** The same conversation weighed letting
   trackers derive status from branch/PR events instead of mirroring it; phase 2
   decides how this model sits beside that, and Azure's complete-on-merge stays
   off for rc-flows.

## Solution overview

Phase 1 measures; phase 2 writes the go/no-go design and, on a go, the build
phases (creation at `/spec` with no git write, materialise at `/spec-start`
replacing `specOnForkPoint`, completion's archive move, `docs-freshness check`
asking the tracker, the authoring review surface).

## Impact

_No external surface changes — spike and design only; build phases name them._

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Round-trip fidelity spike, per provider | ⬜ | [01-fidelity-spike.md](01-fidelity-spike.md) |
| 2 | Go/no-go design; write the build phases | ⬜ | [02-design.md](02-design.md) |

## Open questions

- [ ] Which providers hold a spec losslessly (phase 1 answers).
- [ ] Does tracker mode fork the product (filesystem vs tracker) in a way the
      docs and skills can carry without two of everything?
- [ ] Authoring loses the diff-review page — is a ticket preview enough, or does
      `/spec` render the page before creating the ticket?
- [ ] `docs-freshness check` reads `specs/backlog/` — what does it ask instead?

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-06 | Draft | backlog | Reuben Greaves |

## Changelog

- 2026-11-06 — Spec created from the `feat-pr-landing` follow-up so the design
  context outlives the session (source: that spec's Changelog and the
  2026-11-06 PR-mode design conversation). Draft by design: the spike decides
  what is built.
