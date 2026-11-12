---
github_identifier: "#187"
github_url: "https://github.com/SkitterByte/skitterspec/issues/187"
---

# Epic commands that read as spec commands, and an epic view that says what's next

> **Type:** Feature
> **Name:** feat-spec-epic-commands (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/187
> **Author:** Reuben Greaves
> **Raised:** 2026-11-12
> **Area:** packages/common/assets/commands/epic.md (→ spec-epic.md), packages/common/assets/skills/spec-epic-next/SKILL.md (new), packages/common/assets/skills/{spec,spec-start,spec-complete}/SKILL.md, packages/common/assets/rules/spec-planning.md, packages/common/src/env/{epic,epicpage,epicread}.js, packages/common/src/cli.js, packages/common/test/*epic*, READMEs, docs/{index,review,reference}.html
> **Stack:** worktree
> **Docs:** index, review, reference

## Summary

The `/epic` command becomes `/spec-epic`, so it reads as a spec command like
the rest. A new `/spec-epic-next` finds the epic member that can start now
(asking you to pick when several can) and gives you the `/spec-start` to run
in a new tab. Completing an epic member points you at it. The epic page and
`epic status` group members into in flight, ready, waiting and done, and end
on a numbered list of next steps saying what to type in which tab.

## Problem

Every lifecycle skill and every spec command except `/allow-main` and
`/no-spec` is prefixed `spec-`, and that prefix is how a user tells which
commands belong to the spec workflow. `/epic`, shipped in feat-epic-next, breaks
that. Separately, starting the next member of an epic means reading the whole
`/epic` table to find a row whose next action is `/spec-start` and whose lane
is free. That is a lookup the tooling can do, and the natural moment to ask
is right after a member completes. The epic page itself is one flat table in
alphabetical order. It does not say how far along the epic is, mixes done
members in with live ones, and leaves the reader to work out what to do next
from the `next` cells.

## Acceptance criteria

- `/spec-epic [<epic>]` behaves exactly as `/epic` did. `/epic` is no longer
  shipped.
- `skitterspec update` removes an installed, unedited `.claude/commands/epic.md`
  and keeps an edited one with a warning.
- `/spec-epic-next [<epic>]` with one startable member ends with
  `/spec-start <member>` (in a new tab) as `Next`, and changes nothing on disk.
- With several startable members it offers a picker and never chooses for you.
  A clashing member is listed with its clash.
- With no free lane, or nothing ready, it refuses (`⏸`) and names what is in
  flight or what the members wait on.
- `/spec-complete` on an epic member names `/spec-epic-next` as `Next`.
- The epic page and `epic status` show `N of M done`, group members into in
  flight / ready / waiting / done, and end on numbered next steps. Each step
  says which tab, the command, what it unblocks, and any clash.

## Decisions

1. **Clean rename, no alias.** `epic.md` → `spec-epic.md` in
   `packages/common/assets/commands/`. `update`'s manifest already retires a
   file the distribution stops shipping (removed if unedited, kept with a
   warning if edited). `/epic` shipped on 2026-11-11, so an alias would cost
   more than it saves. *Rejected:* keeping `/epic` as an alias for a release,
   which means a second retirement later.
2. **`/allow-main` and `/no-spec` stay as they are.** `/no-spec` is the
   one place where *no spec* is the point, and `/allow-main` lifts a guard
   rather than acting on a spec. Renaming them is out of scope.
3. **`/spec-epic` is not an authoring door.** `/spec`'s rule "there is no
   `/spec-epic`" was about writing an epic, and it stays true: epics are still
   written through `/spec`. The line is reworded so it does not contradict
   the new command's name.
4. **`/spec-epic-next` picks and prints; it starts nothing.** Members are
   built in their own tabs and the epic tab stays the coordinator, so the
   skill's output is `/spec-start <member>` to type in a new tab. It writes
   nothing, provisions nothing and moves no session. *Rejected:* running
   `/spec-start` in this tab, which would take the session away from the
   coordinator. *Rejected:* provisioning without building, which would
   duplicate `/spec-start`'s set-up in a second place.
5. **One answer, read from the engine.** The skill reads
   `skitterspec epic status [<epic>] --json` and takes its start steps from
   `steps` (Decision 9). No `epic next` engine verb: feat-epic-next Decision 1 rejected a
   second view that could disagree with the first.
6. **Several ready → picker; never a guess.** One startable member is named
   directly. Several are offered as a picker (the members, plus Cancel).
   A clash is shown beside its member rather than filtered out, because
   `Area:` overlap is advice and `/spec-start` §4c already raises it.
7. **Refusals carry the reason.** No free lane → `⏸` naming the members
   holding lanes. Nothing ready → `⏸` naming what each waits on. Any row
   `cannot tell` → `⏸` saying so, never a guessed start
   (`.claude/rules/negative-checks.md`).
8. **Model-invocable skill**, like `/spec-next`, so `/spec-complete` on a spec
   carrying `> **Epic:**` names `/spec-epic-next` as its `Next`. This is a
   narrow exception to "`Next` is one action for this spec": the completed
   member's own work is done, and the next thing for that epic is the
   action. The skill still reports nothing else.
9. **Next steps are computed once, in the engine**, and rendered by the page,
   the text view and `/spec-epic-next` alike. Order: actions in in-flight tabs
   first, in precedence order (pass waiting, verdict, `/spec-complete`,
   `/spec-next`), then `/spec-start` for ready members, capped at the free
   lanes. A step carries `unblocks` (members whose `Waits on:` it satisfies) and
   `caution` (a clash with an in-flight member). A member that is
   `building · uncommitted` gets no step, because there is nothing to type.
   Once every member is done, the only step is `/spec-complete <epic>`.
10. **Group, don't filter.** Every member appears in exactly one of in flight,
    ready, waiting and done. Done collapses to a count but stays reachable.
    `cannot tell` sits in waiting with its reason, never in ready
    (`.claude/rules/negative-checks.md`). Waves and never-together move behind
    a disclosure at the bottom: they explain the order, while next steps act
    on it.

## Solution overview

```
/spec-epic-next                       # in the epic tab or a member's tab
  → skitterspec epic status --json    # bare resolves from epic/member worktree
  → rows where next.verb == "start"
       0 + no free lane  → ⏸ lanes held by feat-cart, feat-pay
       0                 → ⏸ feat-refund waits on feat-pay phase 2
       1                 → Next: /spec-start feat-tax  (in a new tab)
       2+                → picker: feat-tax · feat-ship (clashes with feat-cart) · Cancel
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | remove | `/epic` command |
| Skill/rule | add | `/spec-epic [<epic>]` command (user-only, same body) |
| Skill/rule | add | `/spec-epic-next [<epic>]` skill (model-invocable, read-only) |
| Skill/rule | update | `/spec-complete` `Next` on an epic member → `/spec-epic-next` |
| Skill/rule | update | `/spec`, `/spec-start`, `spec-planning.md` — `/epic` → `/spec-epic`; skill table row |
| Route/UI | update | epic page: progress bar, grouped members, Next steps; names `/spec-epic` |
| CLI command | update | `epic status [--json]` — `progress`, `groups`, `steps`; grouped text view |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Rename `/epic` → `/spec-epic` | ✅ | [01-rename-epic-command.md](01-rename-epic-command.md) |
| 2 | `/spec-epic-next` skill and the `/spec-complete` hand-off | ✅ | [02-spec-epic-next.md](02-spec-epic-next.md) |
| 3 | Epic view grouped by state, with next steps | ✅ | [03-epic-page-grouped.md](03-epic-page-grouped.md) |

## Open questions

- None

## Changelog

- 2026-11-12 — Spec created.
- 2026-11-12 — Added phase 3 (epic page rework) from review of a live epic page.
- 2026-11-12 — Phase 1: the docs pages' `verified:` were not bumped. Each
  edit was a one-token rename and the rest of each page was not re-read, the
  same call feat-epic-next made for `index`. The published-docs token pattern
  keeps `epic`, so a stray `/epic` left in the docs now fails as an unknown
  command rather than passing unnoticed.
- 2026-11-12 — Phase 2: shipping a fifteenth base skill also touched
  `spec-init`'s skill enumeration, the `docs/index.html` chips,
  `docs/linear.html`'s quoted `21 skills installed`, and the repo's own
  `.claude/skills` link. Those are the guards that keep each list from going
  stale. The skill reads `rows` for now, and phase 3 moves it to `steps`.
- 2026-11-12 — Phase 3: `epicPlan` lives in `nextaction.js` beside
  `epicRows` and rides `epicAnswer`, so `--json`, the page and the text view
  read one object. When there is one free lane, the start with no clash goes
  first. The in-flight rows no longer carry a `next` cell, because the
  numbered steps say it once. Docs `verified:` were not bumped: only the epic
  paragraphs were re-read.
- 2026-11-12 — Follow-up surfaced: `/spec-start` on an epic (§6) still works
  out its first starts from `rows` and leaves out clashing members, while
  `steps` lists them with a caution. The two should read one answer. That is
  not in scope here.
- 2026-11-12 — Completed; all phases done, tests green.
