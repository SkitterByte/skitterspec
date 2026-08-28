# Feature: defer phase sub-issues until a spec starts

> **Type:** Feature
> **Name:** feat-defer-phase-subissues (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 2 (started 2026-08-28)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-28
> **Area:** packages/linear/src/config.js, packages/sync-core/src/normalize.js, packages/linear/src/cli-sync.js, packages/linear/assets/
> **Stack:** worktree

## Problem

Adopting sync in a project that already has a long backlog costs one
`save_issue` call per spec **plus one per phase**, all at once — to mirror work
nobody has started. `normalizeLocal` projects a sub-issue for every phase file
unconditionally (`normalize.js:587`), so the first push of a spec is always
`1 + N` writes.

Measured on this repo: **35 specs, 95 phase files**. Mirroring the lot costs
**130 calls where 35 would do** — a 73% reduction, and the 95 deferred calls are
spread out over months instead of landing in one session.

The field suggestion was to mirror the spec issue alone and skip sub-issues.
That is right for a backlog but wrong as an end state: a spec being *worked* is
exactly when its phase breakdown earns its place in the tracker. So the saving
should be a **deferral**, not an omission — the sub-issues appear when the work
does.

## Decisions

1. **A new `mapping.phases` value: `"deferred"`.** The knob already exists and
   has only ever held `"subissue"`; this gives it a second value rather than
   inventing a parallel flag. Validated as an enum like `mapping.tasks`, so a
   typo throws instead of silently reading as the default.
2. **Opt-in — `"subissue"` stays the default.** A minor bump, no existing mirror
   changes shape. Changing the default would be a major for almost no reach: the
   shipped `linear.config.json.example` pins `"subissue"`, so anyone who copied
   it is unaffected either way.
3. **Deferral withholds only phases that have never been pushed.** A phase
   already carrying a `linear_issue_id` keeps projecting whatever the mode. One-
   way sync has no delete op, so withholding a *linked* sub-issue would not
   remove it — it would freeze it, live in the tracker and silently no longer
   updated. Switching a project to `deferred` must never strand what is already
   mirrored.
4. **Withhold while the spec's projected status is `backlog` or `cancelled`.**
   Not the folder directly but `workflowState` — the same value that becomes the
   issue's state — so the mirror is self-consistent, and a `spec_status`
   frontmatter override moves both together. `cancelled` is included by the same
   logic as `backlog`: a spec cancelled without ever starting never had phases
   worth minting, and one cancelled mid-flight has ids already, so Decision 3
   keeps projecting it.
5. **A withheld spec keeps its `## Phases` index in the description.** That
   section is stripped today *because* phases become sub-issues
   (`normalize.js:569-572`). Withhold the sub-issues and strip it too and a
   backlog issue arrives with no phase breakdown at all — strictly worse than
   before. Scoped tightly to the deferral so no other spec's description churns:
   the index is retained only when the mode actually withheld a phase.
6. **`/spec-go` pushes automatically under deferral.** The seam calls the push
   "optional" today, which is fine when sub-issues already exist. Under
   deferral the push *is* the mechanism that mints them, so a skipped push
   leaves a started spec mirrored as a phase-less issue. Automatic only in this
   mode; the seam's wording is unchanged for `"subissue"`.
7. **No new snapshot state.** `snapshotOf` records only sub-issues that have an
   id, so a withheld phase is already absent from the snapshot and reappears as
   a plain `create` the moment it projects. The deferral is a filter on the
   projection, not a new lifecycle — which is why it needs no migration.

## Solution overview

`loadLinearConfig` validates `mapping.phases` against `subissue|deferred`.
`normalizeLocal` computes the projected `workflowState` first, then — when the
mode is `deferred` and that status is `backlog`/`cancelled` — filters phases
with no `id` out of `subIssues`, and keeps `Phases` in the description if it
filtered anything. `spec-sync push`/`status` report the withheld count so the
deferral is visible rather than looking like a mirror that lost its phases. The
`/spec-go` seam runs the push itself once the spec reaches `in-progress`.

## Impact map

| Surface | Change | Detail |
|---------|--------|--------|
| Config | add | `mapping.phases: "deferred"`, validated as an enum |
| Engine | change | `normalizeLocal` withholds unlinked phases by status |
| Engine | change | `## Phases` retained in the description while withheld |
| Domain object | none | snapshot shape and `subIssueHash` unchanged |
| CLI | add | `push`/`status` report `N phase(s) deferred until the spec starts` |
| Skill | change | `/spec-go` seam pushes automatically under deferral |
| Docs | update | `linear.config.md`, the config example, both dist READMEs |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Withhold unstarted phases from the projection | ✅ | [01-withhold-projection.md](01-withhold-projection.md) |
| 2 | Surface the deferral: CLI, `/spec-go`, docs | ✅ | [02-surface-and-docs.md](02-surface-and-docs.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-28 | Ready | backlog | Reuben Greaves |
| 2026-08-28 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-28 — Raised from a field report: syncing a project whose backlog was
  already long took a lot of calls, with the suggestion to mirror the spec issue
  alone. Reframed as a deferral rather than an omission (Problem), so the phase
  breakdown still reaches the tracker — just when the work starts.
- 2026-08-28 — Opt-in over new-default, and an automatic `/spec-go` push, both
  chosen by the maintainer (Decisions 2, 6).
- 2026-08-28 — Phase 1: the withheld count was first hung off `normalizeLocal`'s
  return, which two existing tests defend as *exactly* the configured field set.
  Kept that contract and exposed the count as `phasesWithheld(snapshotDir,
  config)` instead — a second read of a few small files, in exchange for a
  reporting-only value that cannot drift into the synced shape or a hash.
- 2026-08-28 — Phase 1: validating `mapping.phases` tightens a key that was
  previously free-form and inert. Only `subissue` was ever documented and the
  shipped example pins it, so real exposure is a hand-written junk value — which
  now throws on load rather than silently doing nothing. Same trade
  `mapping.tasks` already makes; worth calling out at release time.
