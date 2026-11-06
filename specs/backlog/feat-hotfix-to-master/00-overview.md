---
github_identifier: "#118"
github_url: "https://github.com/SkitterByte/skitterspec/issues/118"
---

# Hotfix onto a release branch, carried back to the rc

> **Type:** Feature
> **Name:** feat-hotfix-to-master (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-11-06
> **Area:** packages/common/src/env (hotfix.js, hotfixland.js, provision.js, integrate.js, config.js, cli.js), packages/common/assets/skills (spec-hotfix, spec-complete), packages/common/assets/core/env.config.md, docs/reference.html
> **Stack:** worktree
> **Docs:** reference
> **Origin:** follow-up from `feat-pr-landing` (#106) — LSC's rc-flow; follows [`feat-rolling-base`](../feat-rolling-base/00-overview.md) (#113)
> **Next spec:** [`feat-tracker-held-specs`](../feat-tracker-held-specs/00-overview.md) (#123) — the checkout model, the last of the PR-mode follow-ups

## Problem

LSC hotfixes **onto `master`**, not onto a release tag: `master` takes no
feature commits, only rc merges and hotfixes, and the env branches
(Test/Demo/Live) take master merges and deploy. Today's hotfix forks a worktree
from a **tag** (`> **Base version:**`), cuts a new tag, and cherry-picks onto
`baseBranch`. For LSC the release line is a branch, the fix must land *on* it
(by ff or by PR — they mix), and the carry-back belongs on the **current rc**,
which `baseBranch` now resolves (`feat-rolling-base`). Without this, LSC's
hotfixes happen outside skitterspec entirely.

## Decisions

1. **Scope: land onto the release branch + carry back to the rc.** Merging
   master into Test/Demo/Live stays LSC's pipeline's job. Rejected: offering the
   env-branch merges as consent-gated steps — release plumbing, not the spec
   lifecycle, and each team's env set differs.
2. **A release branch is configured, not inferred:** `hotfix.releaseBranch`
   (e.g. `"master"`). When set, `/spec-hotfix` forks from
   `<remote>/<releaseBranch>` at its head and records
   `> **Base version:** master@<sha>`; when unset, today's tag flow is
   unchanged, byte for byte.
3. **The land onto the release branch uses `land.strategy`** (`ff` or `pr`, with
   `--strategy` per invocation), reusing `feat-pr-landing`'s planner, consent
   gate and host-aware landed check. A hotfix PR is opened **ready**, never
   draft — it is finished work.
4. **Tagging is optional.** `hotfix.tag` (default `true`) keeps today's
   release-tag cut on the release branch; `false` for a team whose deploy is
   driven by the env-branch merge rather than a tag. Avoids an unanswerable
   question about LSC's tagging blocking the spec.
5. **Carry-back targets the resolved base** — the newest rc under
   `baseBranchPattern` — using the existing carry (commits minus the version
   commit, minus anything already there). In `pr` mode the carry is its own
   branch + PR into the rc, because the rc may be protected too.
6. **Depends on `feat-rolling-base`** for resolving the carry target; with a
   literal `baseBranch` it works without it.

## Solution overview

`hotfix.releaseBranch` switches the hotfix from *tag-based* to
*branch-based*: fork from the remote release branch, land onto it through the
`land.strategy` planner (consent, push, PR, landed check), optionally tag, then
carry onto the resolved rc — directly under `ff`, through a carry PR under
`pr`. `hotfix finish` tears down once the release-branch land is confirmed
(merged, by the host-aware check) instead of once a tag is pushed.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `hotfix.releaseBranch`, `hotfix.tag` |
| CLI command | update | `spec-env hotfix land` — branch-based plan: land via `land.strategy`, optional tag, carry to resolved base |
| CLI command | update | `spec-env hotfix finish` — confirms a merged release-branch land when branch-based |
| CLI command | update | `spec-env up` (hotfix) — fork from `<remote>/<releaseBranch>` |
| Business rule | update | `Base version:` accepts `<branch>@<sha>` |
| Skill/rule | update | spec-hotfix, spec-complete hotfix paths |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `hotfix.releaseBranch` config + fork from the release branch | ⬜ | [01-release-branch-fork.md](01-release-branch-fork.md) |
| 2 | Land onto the release branch via `land.strategy`; optional tag | ⬜ | [02-land-onto-release-branch.md](02-land-onto-release-branch.md) |
| 3 | Carry back to the resolved rc (direct or carry PR); finish | ⬜ | [03-carry-back-to-rc.md](03-carry-back-to-rc.md) |
| 4 | Skills, env.config.md, reference docs | ⬜ | [04-skills-and-docs.md](04-skills-and-docs.md) |

## Open questions

- None blocking. Confirm with LSC when this starts whether they tag releases on
  `master` — it only decides their `hotfix.tag` value, not the design.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-06 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-11-06 — Spec created from the `feat-pr-landing` follow-up (hotfix-to-master
  mapping: master as release line, rc as carry-back, env branches as targets).
  Grilled to land + carry-back only; env branches dropped from scope.
