---
github_identifier: "#50"
github_url: "https://github.com/SkitterByte/skitterspec/issues/50"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Azure Boards: release tag and Deployed field on story cards

> **Type:** Feature
> **Name:** feat-azure-release-card-fields (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-10-28)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-28
> **Area:** packages/azure-boards/src/api.js, packages/azure-boards/src/config.js, packages/azure-boards/src/cli-sync.js, packages/azure-boards/assets/core
> **Stack:** worktree

## Problem

On Azure Boards a story goes `Active → Closed` when its spec lands, and the
release seam only moves the **Release** work item through `On Test` /
`On Demo` / `Released`. The story card shows neither which release carried it
nor where that release is deployed — the link is a Related relation and a
comment, both invisible on the board. In ereqs that leaves the Closed column a
pile with no deployment signal. The GitHub provider already solves this with a
per-ticket **Deployed** field set by `releaseStage`; Azure has no equivalent.

## Decisions

1. **`releaseAttach` tags each spec story with the release tag, bare**
   (`v37.7.0`). Tags render on cards and filter the board, need no process
   change, and a story shipped twice simply carries both. Rejected: a
   `release:` prefix (longer chip on every card) and a template key (config
   nobody asked for).
2. **Tagging is on by default; `releases.ticketTag: false` opts out.** Adding a
   tag that is already there is a no-op, so it is safe to turn on for everyone.
3. **The tag is checked per ticket, independently of the Related link.** A
   ticket already linked but untagged still gets the tag, so re-running
   `release create <tag> --apply` backfills releases cut before this shipped.
   The comment stays as it is: only on a newly linked ticket.
4. **Tags are read-modify-write.** An `add` on `System.Tags` replaces the whole
   value, so the write is the ticket's existing tags plus the new one — never
   the new one alone.
5. **`releases.deployedField` names a field reference** (e.g. `Custom.Deployed`)
   that `releaseStage` sets on every attached spec story. Empty (the default)
   means no field write, which is the behaviour today. It is opt-in because
   the field has to be added to the process first.
6. **The field value is the env's configured value from `series[].envs`** — the
   same name the Release item's state moves to. One map, so the item and its
   stories cannot disagree. Rejected: env keys, or a second map.
7. **The value is validated before the first write.** For each work item type
   among the attached tickets, read the field's allowed values. A type without
   the field, or a value it doesn't allow, refuses with what the type does
   allow, and nothing is written. That matches GitHub's `optionFor`.
8. **Spec stories only, never phase Tasks.** Tasks are rarely on a board and
   would need the field too. This deliberately differs from GitHub, which also
   stamps closed sub-issues.
9. **Ticket `System.State` is never touched.** Deployment stays off the
   ticket's work state (`azure-boards.config.md`, *Choosing your state map*).
   A field is a mirror, not a second state machine.

**Non-goals:** `reconcile` on Azure (it has no `releaseList`), board or process
setup (that's the operator's, in Azure), and the MCP transport (release verbs
are already API-only).

## Solution overview

- `releaseAttach(release, tickets)` — after the existing link-and-comment loop,
  reads each ticket's tags (one batch read) and appends the release tag where it
  is missing, unless `ticketTag` is `false`. It returns `tagged` beside
  `attached`/`already`, and `create` prints it on its `issues:` line.
- `releaseStage(release, stateName, tickets)` — moves the release item as now.
  Then, when `deployedField` is set, it validates the value per ticket type and
  writes the field on each ticket whose value differs. `set` becomes 1 + the
  number of stories changed.
- `makeApiAdapter` receives `ticketTag` and `deployedField` alongside
  `releaseType`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `releases.ticketTag` (bool, default `true`) |
| Config key | add | `releases.deployedField` (field ref, default `""`) |
| Service | update | Azure `releaseAttach` — tags tickets, returns `tagged` |
| Service | update | Azure `releaseStage` — validates and sets `deployedField` on tickets |
| CLI command | update | `spec-sync release create` / `deployed` output lines |
| Skill/rule | update | `azure-boards.config.md`, `SETUP.md` — field setup and board tips |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Release tag on attach | ⬜ | [01-release-tag.md](01-release-tag.md) |
| 2 | Deployed field on stage | ⬜ | [02-deployed-field.md](02-deployed-field.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-28 | Ready | backlog | Reuben Greaves |
| 2026-10-28 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-28 — Spec created, prompted by the ereqs Stories board having no
  deployment signal on Closed cards.
