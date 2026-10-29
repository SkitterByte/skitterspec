---
github_identifier: "#59"
github_url: "https://github.com/SkitterByte/skitterspec/issues/59"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# `/spec-list` as the board in the terminal: state aliases, assignee, `--mine`, `--next`

> **Type:** Feature
> **Name:** feat-spec-list-board (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-10-29)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-29
> **Area:** packages/sync-core/src/normalize.js, packages/{azure-boards,github,linear,jira}/src/config.js, packages/{azure-boards,github,linear}/src/cli-sync.js, packages/azure-boards/src/api.js, packages/github/src/api.js, .claude skills spec-list (per provider), provider config docs
> **Stack:** worktree

## Problem

Working in the terminal, "what's next, and what is mine?" should be answerable
without opening the board. `/spec-list` already lists the tracker live, with its
own state names and the local spec folder. On Azure and GitHub, though, it
has no assignee, no `--mine` or `--by`, and no backlog order. Linear has all
three. Separately, each lifecycle bucket maps to exactly one tracker state.
So a board's extra states ("Blocked", "Released", "Won't Do") are unmapped,
and two things go wrong:

- `/spec-status` can only report them as unmapped.
- `/spec-list`'s live view shows an unmapped *finished* state as live work.

## Decisions

1. **One command, flags not new skills.** `/spec-list` grows filters. No
   `spec-tickets`, `spec-my-tickets` or `/spec-mine`: two near-identical
   listings drift apart.
2. **State aliases are read-side only.** `states.<bucket>` may be a string (as
   today) or a non-empty array of names.
   - **Push writes the first name**, at our transitions only.
   - **The rest read as that bucket**: drift, the list filter, `--state`.
   - A plain string is unchanged, so no config has to move.
   - No pull, ever: aliases change what we *say*, never the spec.
3. **All four providers parse aliases** (Azure, GitHub, Linear, Jira). The
   `states` shape is shared config, and one provider refusing what another
   accepts is a trap.
4. **Aliases absorb `release.stages`' drift role.** `complete: ["Closed",
   "On Test"]` says the same thing. `release.stages` keeps working, and both
   are read.
5. **Assignee on every row, plus `--mine` / `--by <user>` on Azure and GitHub**,
   ported from Linear's contract: the two are mutually exclusive, and `--mine`
   refuses rather than listing everyone when `whoami` cannot answer. Identity
   comes from each provider's existing `whoami` and `users`.
6. **`--mine` includes tickets with no spec yet**, marked `(no spec)`.
   Assigned-but-unspec'd work is exactly "what's next".
7. **`--next N` on Azure and GitHub**: the top of the backlog in the tracker's
   own order. Azure orders by `Microsoft.VSTS.Common.StackRank`; GitHub by
   board position. It is a scope flag, so it is exclusive with `--state` and
   `--all`, matching Linear.
8. **`--state` accepts bucket names too.** `--state in-progress` expands through
   the aliases to every tracker name for that bucket. A name that is not a
   bucket is matched as a tracker state, as today. Applies to Azure, GitHub and
   Linear.
9. **The spec status is always shown beside the board status.** It is read from
   the spec's **own worktree** when one is provisioned (`git worktree list`),
   else from the current tree. On main, an in-flight spec's folder still reads
   `backlog`, so the current tree alone would be wrong exactly where it matters.
   A spec not on this machine shows `—`. A row whose two statuses disagree under
   the aliases gets a `≠` marker; an unmapped state never does.
10. **The live default hides every name aliased to `complete` or `cancelled`**,
    not only the first. This is the bug in decision 2's second bullet.

## Solution overview

```jsonc
"states": {
  "backlog": ["Groomed", "New", "Next Sprint"],
  "in-progress": ["Active", "Blocked"],
  "complete": ["Closed", "On Test", "On Demo", "Released"],
  "cancelled": ["Removed", "Won't Do"]
}
```

```
$ skitterspec spec-sync list --mine
  AB#412  Active   in-progress   Reuben Greaves  Release tag on cards      -> feat-azure-release-card-fields
  AB#430  Blocked  in-progress   Reuben Greaves  Banner shows tailnet      -> bug-banner-tailnet
  AB#455  New      (no spec)     Reuben Greaves  Export requisitions CSV
  AB#460  Active ≠ backlog       Reuben Greaves  Approver reminders        -> feat-approver-reminders
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `states.<bucket>`: string or array (first = written) — all four providers |
| Business rule | update | sync-core `bucketForState` reads aliases; push writes `primaryState(bucket)` |
| CLI command | update | azure/github `spec-sync list`: assignee column, `--mine`, `--by`, `--next N` |
| CLI command | update | azure/github/linear `spec-sync list`: `--state <bucket>`, spec-status column, `≠` |
| Service | update | azure `searchIssues` (+`System.AssignedTo`, `StackRank`); github list (+assignees, board order) |
| Skill/rule | update | `/spec-list` (per provider): flags table, stale "identity support" caveat removed |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Read-side state aliases | ⬜ | [01-state-aliases.md](01-state-aliases.md) |
| 2 | Assignee, `--mine`, `--by` on Azure and GitHub | ⬜ | [02-assignee-filters.md](02-assignee-filters.md) |
| 3 | `--next`, `--state <bucket>`, spec-status column | ⬜ | [03-next-and-spec-column.md](03-next-and-spec-column.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-29 | Ready | backlog | Reuben Greaves |
| 2026-10-29 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-29 — Spec created.
