---
github_identifier: "#106"
github_url: "https://github.com/SkitterByte/skitterspec/issues/106"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# PR landing mode — land by pushing a branch, not by fast-forwarding main

> **Type:** Feature
> **Name:** feat-pr-landing (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-11-06)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-11-06
> **Area:** packages/common/src/env (integrate.js, teardown.js, resolve.js, config.js, cli.js), packages/common/assets/skills (spec, spec-start, spec-to-main, spec-complete, spec-cancel), packages/common/assets/rules (spec-planning.md, spec-reports.md), packages/common/assets/core/env.config.md, packages/provider-kit/src/released.js, docs/*.html
> **Stack:** worktree
> **Docs:** reference, review, github, azure-boards

## Problem

Every skitterspec land is trunk-based: `spec-env integrate` plans a rebase plus
a local `merge --ff-only`, and "landed" everywhere means "the branch is an
ancestor of local base". A project whose base branch only moves by pull request
(the first adopter is on Azure DevOps; merge style varies by adopter and may be
squash) cannot use the lifecycle at all: completion must mean *commit on the
feature branch, rebase, push, open a PR*, and the merge happens later, on the
host, possibly rewriting SHAs so ancestry tests go false forever. The host and
tracker also close the ticket at merge — outside skitterspec's control — so
unfinished tasks and follow-ups would be silently buried under a Done ticket.

## Decisions

1. **PR mode is a landing strategy, not a product fork:** `land.strategy:
   "ff" | "pr"`, default `ff`. Filesystem/trunk projects see zero change.
   Rejected: a mode-wide fork of the skills (the lifecycle is identical until
   the land).
2. **"Landed" gets one owner: the host.** A small host adapter answers "is the
   PR for this branch merged?", detected from the remote URL (`dev.azure.com` →
   `az`, `github.com` → `gh`); ancestry remains as fallback for hosts with no
   adapter. Every cannot-tell biases to inaction — teardown holds the worktree
   and says why, never force-deletes (`negative-checks.md` rule 4). Rejected:
   per-merge-style heuristics (patch-id/cherry) — adopters' merge styles vary
   and the host always knows.
3. **The push is consent-gated, reusing the hotfix pattern verbatim:**
   already-pushed is honoured as the positive signal, `--push` pushes on the
   user's recorded yes, otherwise the plan holds and prints the commands.
   Rejected: auto-push (the codebase's standing stance), and a `--force`.
4. **Mid-spec work is a draft PR.** A draft cannot be merged and tracker
   automations read it as in-progress, so premature ticket closure is
   structurally impossible until skitterspec itself flips the PR to ready.
   `/spec-to-main` in PR mode becomes "push the branch, open/update the draft
   PR" — same intent (get the work into CI/shared env), new transport.
5. **Completion is two runs, mirroring `hotfix land`/`finish`.** Run 1:
   disposition guard, then push and flip the PR to ready; the worktree stays.
   Run 2 (after the host merge): verify landed via the adapter, pull base, run
   `afterLand`, move the spec to `specs/complete/`, tear down. Rejected: a
   blocking wait on the merge (unbounded, and the merge is someone else's act).
6. **The disposition guard is the last control point, so it is mandatory in PR
   mode.** Before the PR goes ready, every unticked task, open follow-up and
   unfinished phase is enumerated and the user disposes each: tick with
   evidence · spin off as a linked follow-on ticket · drop with a recorded
   reason (the `Gating:`-header logic: a reason is arguable, silence is an
   oversight). Ask, never auto-create — the operator answers and the choice is
   recorded. Enumeration is automatic; deciding is human.
7. **Both authoring paths ship, per-project:** `land.specDocs: "trunk" |
   "branch"`. `trunk` keeps today's authoring land (needs direct push for
   docs); `branch` has the spec document ride the feature branch and land with
   the work's PR — C2's integrate step is skipped, `/spec-start` continues in
   the same worktree, and backlog discovery leans on the tracker listing.
   Decided as config because adopters' branch-protection realities differ.
8. **Release scan hardening, not redesign:** `--no-merges` on every history
   scan (safe in both modes), and a documented squash-message requirement
   (commit bodies kept) for trailers to survive. Closing keywords stay banned —
   host linking tokens (`AB#123`) are a separate mechanism.
9. **Independent of `feat-tracker-owns-status` (#93).** PR mode strengthens it
   (native automations derive status from real git events) but neither blocks
   the other; this spec touches landing, that one touches status ownership.

## Solution overview

- **Engine:** a third pure planner in `integrate.js` (`planIntegratePr`):
  fetch, rebase onto `origin/<base>`, `push --force-with-lease`, PR
  create/ready via the detected host CLI — gated by the hotfix-style consent
  shape. A `hostAdapter` module answers `prMerged(branch)` /
  `prFor(branch)` → `merged | open | draft | none | cannot-tell`.
  `worktreeGitState.merged` and checkout-mode `landed` become
  `ancestry || hostMerged`.
- **Targets:** in PR mode every rebase/fork/diff target becomes `origin/<base>`
  after a fetch (provision fork point, integrate, `live take`, review-diff
  merge-base).
- **Skills:** `/spec-to-main` and `/spec-complete` branch on
  `land.strategy` from the engine's plan output — the skills run what the plan
  prints, as today. New report vocabulary: `Landed: PR #N opened` / `PR #N
  merged`. `/spec-cancel` abandons the open PR.
- **Config:** `land: { strategy, remote, draft, specDocs }` with defaults
  `{ "ff", "origin", true, "trunk" }` — added to `DEFAULT_CONFIG`, `defaults()`
  and `env.config.md`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `land.strategy`, `land.remote`, `land.draft`, `land.specDocs` |
| CLI command | update | `spec-env integrate`: PR plan (fetch, rebase onto origin/base, push, PR) behind consent |
| CLI command | update | `spec-env down` / checkout down: landed = ancestry ∨ host-merged; cannot-tell holds |
| CLI command | add | host adapter: `prFor`/`prMerged` via az/gh detected from remote URL |
| Skill/rule | update | spec-to-main (draft PR), spec-complete (disposition guard + two-run), spec-cancel (abandon PR), spec (C2 per `specDocs`), spec-start (fork from origin/base) |
| Business rule | update | disposition guard: unticked work disposed (tick/spin-off/drop) before PR goes ready |
| CLI command | update | `spec-sync released`: `--no-merges`; squash-message policy documented |
| Skill/rule | update | spec-planning.md, spec-reports.md (`Landed` vocabulary), env.config.md |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `land` config + PR integrate planner behind consent | ✅ | [01-land-config-and-pr-plan.md](01-land-config-and-pr-plan.md) |
| 2 | Host adapter + host-aware landed check | ⬜ | [02-host-adapter-landed-check.md](02-host-adapter-landed-check.md) |
| 3 | origin/base targets + mid-spec draft PR (`/spec-to-main`) | ⬜ | [03-origin-targets-draft-pr.md](03-origin-targets-draft-pr.md) |
| 4 | Completion: disposition guard + two-run complete; cancel abandons PR | ⬜ | [04-completion-disposition-two-run.md](04-completion-disposition-two-run.md) |
| 5 | Authoring paths: `land.specDocs` trunk · branch | ⬜ | [05-authoring-spec-docs-path.md](05-authoring-spec-docs-path.md) |
| 6 | Release-scan hardening + rules, docs, report vocabulary | ⬜ | [06-release-scan-rules-docs.md](06-release-scan-rules-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-06 | Ready | backlog | Reuben Greaves |
| 2026-11-06 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-11-06 — Phase 1: `pushedAtHead` folds the push into the run list
  (via `remote`) rather than omitting it — the rebase may move the tip, and a
  no-op `push --force-with-lease` is harmless, so the positive signal is read
  as consent, not as "nothing to push".
- 2026-11-06 — Spec created. Converged from a design review of what trunk-based
  assumptions cost a PR-based adopter (Azure DevOps first). Scope deliberately
  excludes the checkout model (tracker holds dormant specs): that needs a
  round-trip fidelity spike per provider, and it partially revisits
  `feat-tracker-owns-status` Decision 1 — `/spec-review` #93 when it is taken
  up.
