# /spec-list shows local specs Linear has never seen

> **Type:** Feature
> **Name:** feat-list-unpushed-specs (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-10-18)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-18
> **Area:** packages/linear/src/cli-sync.js, packages/linear/test/cli-list.test.js, packages/linear/assets/skills/spec-list/SKILL.md
> **Stack:** worktree

## Problem

`spec-sync list` answers from Linear and reads the repo only to attach folder
names to Linear's rows. A spec that was written but never pushed has no
identifier, so it is not on any row. `bug-compose-before-env` sat in
`specs/backlog/` on `main` and the listing showed 3 live specs without it.
The listing exists to show what is actually in play, so leaving out a spec the
repo holds is the same gap it was built to close, just from the other side.

## Decisions

1. **Own section, below Linear's rows.** It is a separate block headed
   `local only — not linked on this branch (N)`, and each row hints
   `/spec-push <name>`. `showing N of M` keeps counting Linear's rows only.
   Rejected: mixing them into the rows, because that blends two sources into one
   count.
2. **The heading says "not linked on this branch", not "not in Linear".** The
   evidence is a missing `linear_identifier` in this branch's copy of the file.
   A spec pushed from its own worktree whose stamp has not landed yet looks
   exactly the same, so "not in Linear" would be an accusation the lookup cannot
   back (`.claude/rules/negative-checks.md` rule 1).
3. **Live buckets only: `backlog` and `in-progress`, under every scope.**
   `complete/` holds many specs from before Linear was set up that were never
   pushed, and listing them under `--all` would bury the rows anyone wanted.
4. **The section follows the scope's bucket where the scope names one.**
   `--in-progress` shows only `in-progress`, `--next` shows only `backlog`, and
   every other scope shows both.
5. **`--next N` shows the section uncapped.** An unpushed spec has no place in
   Linear's Backlog order, so it never takes one of the N slots. The section
   still appears, because the next thing to work on may be the one Linear has
   not seen.
6. **`--mine` / `--by` leave out the section and print one line saying so**:
   `N unpushed specs not filtered by assignee — the bare listing shows them`.
   Rejected: matching on the local Author/Developer header, because it compares
   a git name with a Linear name.
7. **JSON gets an additive `local: [{ spec, bucket }]` array.** It is `[]` when
   there are none and absent under `--mine`/`--by`, which carry `localHidden: N`
   instead. Existing fields keep their shape.
8. **The MCP path builds the same section in the skill**, from
   `spec-sync linked --json`, by filtering `identifier: null` to the live buckets.
   The degraded path already lists everything local, so it does not change.

## Solution overview

`specSyncList` already calls `listSpecs(dir, config)`. Partition its result:
entries with an identifier keep feeding `byIdentifier`, and those without one,
in the scope's buckets, become `local`. Print the section after the Linear rows
and before the hand-off, and print nothing at all when `local` is empty.

```
  SKS-154  Backlog  feat-connect-planner

  local only — not linked on this branch (1)
    bug-compose-before-env  backlog   /spec-push bug-compose-before-env
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync list` — local-only section (text) |
| CLI command | update | `spec-sync list --json` — `+local[]`, `+localHidden` |
| Skill/rule | update | `/spec-list` — MCP path builds the section; report keeps it |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine lists unpushed live specs, tested | ⬜ | [01-engine-local-section.md](01-engine-local-section.md) |
| 2 | `/spec-list` skill relays it on every path | ⬜ | [02-skill-relay.md](02-skill-relay.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-18 | Ready | backlog | Reuben Greaves |
| 2026-10-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-18 — Spec created, prompted by `bug-compose-before-env` not appearing
  in `/spec-list`.
