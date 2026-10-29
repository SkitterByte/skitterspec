---
github_identifier: "#55"
github_url: "https://github.com/SkitterByte/skitterspec/issues/55"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Azure Boards: release-driven ticket states, and state-map edits that reach the board

> **Type:** Feature
> **Name:** feat-azure-release-ticket-states (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Cancelled (2026-10-29) — deploy position is not skitterspec's responsibility (CI and the tracker own it), and the state-map backfill is not worth an engine change; superseded by a bug spec for unmapped tracker states reported as drift
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-29
> **Area:** packages/sync-core/src/compare.js, packages/provider-kit/src/releases.js, packages/provider-kit/src/released.js, packages/azure-boards/src/config.js, packages/azure-boards/src/api.js, packages/azure-boards/src/cli-sync.js, packages/azure-boards/assets/core, SETUP.md
> **Stack:** worktree

## Problem

Azure board columns follow **State** only, so the Deployed field
(`feat-azure-release-card-fields`) can colour a card but never give it an
On Test / On Demo column. Ticket states past Closed are already modelled:
`release.stages` is shared config, and sync-core reads a ticket on a declared
rung as `complete`, so no drift is reported. But on Azure nothing moves a ticket
onto a rung. Azure's config also never reads `release.stages` from the file, and
its docs say outright "never deployment stages". Separately, the push resends
State from a hash of the spec's **bucket**, not of the state name that bucket
maps to. So editing `states` (for example adding a `Groomed` state for
`backlog`) never reaches tickets that already exist.

## Decisions

1. **The ladder is `release.stages`, joined to `releases.series[].envs` by
   key.** `release deployed <tag> test` moves the release item to `envs.test`
   (as today) and the release's stories to the `release.stages` rung keyed
   `test`. No new config shape: sync-core's drift tolerance already keys off
   `release.stages`. Rejected: object-valued `envs`
   (`{ release, ticket }`), which is a second way to say the same thing.
2. **An env with no matching rung moves no tickets.** It says so in one line
   and still moves the release item. Ticket moves are opt-in per env.
3. **Forward-only per ticket.** A ticket already on a *later* rung than the
   target (it shipped again in a newer release) is skipped and named. Order is
   the `release.stages` order. **`--rollback`** allows backward moves.
   Rejected: Linear's "order recorded, never enforced", where re-running an old
   release drags newer tickets back.
4. **The kit's skip rules apply unchanged.** `partitionStageMoves` leaves
   foreign, unlinked and unfinished-spec tickets alone. Push still owns an
   unfinished spec's state, so this keeps one writer per ticket.
5. **Validate before any write.** Every rung state must exist on the story work
   item type. Otherwise refuse with "nothing written", including the release
   move, the same way `deployedField` validation works.
6. **The Deployed field stays, independent.** Either, both or neither can be
   configured. The field still serves a project that cannot edit process
   states.
7. **Phase Tasks are never moved**, matching `releaseStage` today.
8. **Azure only.** Linear keeps its own `spec-sync stage`. Jira and Linear get
   no release seam here. The forward-only ordering is written in provider-kit,
   so a later provider can reuse it.
9. **The state hash covers the mapped name, except for `complete`.** For
   `backlog`, `in-progress` and `cancelled` the hash is of `bucket→state name`,
   so editing `states` re-pushes State once and existing tickets move (the
   `Groomed` case). `complete` stays bucket-only: a finished ticket may sit on a
   rung that push cannot see (one-way, no remote read), and resending Closed
   would drag it back. Renaming the complete state therefore needs a manual
   move. That is accepted, because it is rare and the other failure is silent.
10. **Upgrade cost: one redundant State write per non-complete spec.** Old
    snapshots hash the bare bucket, so the first push after upgrade resends the
    same state. It is harmless, and it is what makes the backfill work.

## Solution overview

```jsonc
"states":  { "backlog": "Groomed", "in-progress": "Active", "complete": "Closed", "cancelled": "Removed" },
"release": { "stages": [ { "key": "test", "state": "On Test" },
                         { "key": "demo", "state": "On Demo" },
                         { "key": "prod", "state": "Released" } ] },
"releases": { "series": [ { "tagPrefix": "v", "envs": { "test": "On Test", "demo": "On Demo", "prod": "Released" } } ] }
```

`release deployed v37.7.0 demo --apply` then validates the rung states, moves
the release item, and moves each finished story that is not already past demo
to `On Demo`. It prints moved, skipped-as-later and excluded counts, naming
every skipped or excluded ticket. Process setup: the rung states go in the
**Resolved** category (Completed hides items from backlogs). `Groomed` goes in
**Proposed**. Tickets with no spec yet (raw intake) stay in `New`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Business rule | update | state hash = `bucket→mapped name` for non-complete buckets (`specIssueFieldHashes`, `issueChanges`) |
| Config key | update | azure `release.stages` read and validated from file (unique keys, `{key,state}`) |
| CLI command | update | azure `release deployed <tag> <env> [--rollback]` moves stories along `release.stages` |
| Domain object | add | provider-kit ladder ordering: forward-only filter + `--rollback` |
| Service | update | azure `releaseStage` → also `ticketState` move; reads current State, validates rung states |
| Skill/rule | update | `azure-boards.config.md` state-map guidance; `SETUP.md` §4b Groomed + stages |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | State-map edits re-push State (Groomed backfill) | ⬜ | [01-state-map-rehash.md](01-state-map-rehash.md) |
| 2 | `release deployed` moves stories along the ladder | ⬜ | [02-ticket-ladder.md](02-ticket-ladder.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-29 | Ready | backlog | Reuben Greaves |
| 2026-10-29 | In Progress | in-progress | Reuben Greaves |
| 2026-10-29 | Cancelled | cancelled | Reuben Greaves |

## Changelog

- 2026-10-29 — Spec created.
- 2026-10-29 — Follow-up surfaced: the GitHub linking `apply` fails with
  "Content already exists in this project" after creating the issue (it did
  again here, on #55, and on #50 before). It needs a hand `stamp` and a
  re-apply, so `apply` should treat "already on the board" as success. Not in
  scope here.
- 2026-10-29 — Cancelled: deploy position is not skitterspec's responsibility (CI and the tracker own it), and the state-map backfill is not worth an engine change; superseded by a bug spec for unmapped tracker states reported as drift. Nothing was built.
