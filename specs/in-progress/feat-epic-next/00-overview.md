---
github_identifier: "#161"
github_url: "https://github.com/SkitterByte/skitterspec/issues/161"
---

# Epic next actions — what to run in which tab, and one page that shows it

> **Type:** Feature
> **Name:** feat-epic-next (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/161
> **Author:** Reuben Greaves
> **Raised:** 2026-11-11
> **Area:** packages/common/src/env/{epic.js,inflight.js,serve.js}, packages/common/src/env/nextaction.js (new), packages/common/src/cli.js, packages/common/assets/skills/spec-start/SKILL.md, packages/common/assets/commands/epic.md (new), docs/{review,reference}.html
> **Stack:** worktree
> **Docs:** review, reference

## Summary

`skitterspec epic status` says, for every member, the one thing to do next
and which tab to do it in, and the review server serves the same answer as a
self-refreshing epic page whose rows link to each member's review page. One
epic tab can then run a multi-spec epic across several agent tabs with no
loop and no tokens spent watching.

## Problem

Running an epic means one Claude tab per member plus a coordinating tab.
`epic status` already says what is ready, blocked and in flight, but not what
each member needs **now** — a verdict on a waiting page, an unclaimed pass, a
commit, `/spec-next`, `/spec-complete`. That state lives in each worktree's
`.spec-env/` and in git, so the operator goes tab to tab to find out. On a
phone it is worse: a link opens in the in-app browser, which has to be closed
to switch tabs, so the coordinating tab must keep one link findable.

## Acceptance criteria

- `skitterspec epic status <epic>` prints one row per member with its state,
  its next action and its worktree; `--json` carries the same.
- `skitterspec status` shows the same next action beside each in-flight spec.
- A bare `skitterspec epic status` inside the epic's worktree means that epic.
- The review server serves an epic page that refreshes itself, links each
  member with a waiting page to that page, and never shows a pass code.
- `/spec-start epic-<name>` ends naming the first `/spec-start <member>` per
  free lane and the epic page link; `/epic` re-shows the table and the link.
- A state the engine cannot read is shown as `cannot tell`, never as a verb.

## Decisions

1. **One function decides the next action** (`nextaction.js`), used by both
   `epic status` and `status`. Positive signals only; an unreadable sidecar,
   an unresolvable worktree or a corrupt gate is `cannot tell`
   (`.claude/rules/negative-checks.md`). *Rejected:* `epic next` as its own
   command — a second view that can disagree with the first.
2. **Precedence for an in-flight member**, first match wins:
   1. a pass is waiting unclaimed → `/spec-reviewed <code>` in its tab
   2. the gate is armed → `verdict` with the page link
   3. dirty tree, gate not armed → `building · uncommitted` and **no verb** —
      the engine cannot tell an agent mid-build from work left sitting, and
      `/commit` mid-build is the wrong advice
   4. the next phase is held by an unmet sync point → `waits on <x>`
   5. every phase ✅ and the tree clean → `/spec-complete`
   6. otherwise → `/spec-next` → phase N

   A backlog member: `/spec-start <name>` when ready, qualified `no free lane`
   or `clashes with <x>` when either holds; `waits on <x>` when blocked.
   Complete and cancelled show `—`. The epic's own row says
   `/spec-complete <epic>` once no member is open.
3. **Three renderings of one answer**: a plain-text aligned table (readable raw
   under `watch`, so not a markdown table), `--json`, and the served page.
4. **On demand, never a loop.** Refreshing the page or asking the epic tab
   costs nothing between asks; a `/loop` spends tokens mostly saying nothing
   changed. *Rejected:* `--changed-since` — state to keep for a cost that the
   page already removes.
5. **The epic page is the review server's**, at the existing spec route:
   `/<token>/epic-<name>` renders the epic view where a member would render a
   diff, decided where `serve.js` already decides which view a spec gets. It
   renders per request and refreshes itself every 30 s. Member links are
   **relative**, so they work through whichever tier (local, network, tailnet)
   the page was opened from, and the cell never lists tiers. The index lists
   epics with in-flight members and links them.
6. **The page never shows a pass code.** `serve.js` deliberately keeps routes
   from enumerating what is waiting; the row says `verdict waiting —
   /spec-reviewed in its tab`. The CLI, which is local, shows the code.
7. **The page is read-only.** Verdicts are pressed on member pages it links
   to; everything else is typed in that member's tab.
8. **The link stays one step away in the epic tab.** `/spec-start` on an epic
   ends with the first commands — one `/spec-start <member>` per free lane,
   each marked "in a new tab" — and the epic page stack. `/epic` is a
   user-only command (the `/spec-connect` shape: pre-executes
   `skitterspec epic status`, no model judgment) that re-shows the table and
   the page link, for the phone flow of closing the browser, working other
   tabs, and coming back. The URL is stable for the server's life.

## Solution overview

```
$ skitterspec epic status            # inside epic-checkout's worktree
epic-checkout — 5 members · 2 lanes, 0 free

  member       state                       next                          tab
  feat-cart    phase 2 of 3 · page waits   verdict → <page link>         skitterspec-wt/cart
  feat-pay     phase 1 of 2 · pass waits   /spec-reviewed 324199         skitterspec-wt/pay
  feat-ship    3 of 3 ✅ · clean            /spec-complete                skitterspec-wt/ship
  feat-tax     backlog · ready             /spec-start feat-tax (no free lane)
  feat-refund  backlog                     waits on feat-pay phase 2
  feat-auth    complete                    —

  waves · sync points · never together     (unchanged rows)
  page: http://127.0.0.1:7760/<token>/epic-checkout   (+ network, remote)
```

The served page is the same table, with the `next` cell a link where a page
waits, and the pass code replaced per Decision 6.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | add | next action `{ verb, command, link, why, state }` per spec |
| CLI command | update | `skitterspec epic status [<epic>] [--json]` — member table, bare form resolves |
| CLI command | update | `skitterspec status` — next action per in-flight spec |
| Route/UI | add | served epic page at `/<token>/epic-<name>`, 30 s refresh; index links epics |
| Skill/rule | update | `/spec-start` on an epic: first commands + epic page |
| Skill/rule | add | `/epic` command (user-only) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Next action per spec | ✅ | [01-next-action.md](01-next-action.md) |
| 2 | CLI and JSON output | ✅ | [02-cli-output.md](02-cli-output.md) |
| 3 | Served epic page | ✅ | [03-epic-page.md](03-epic-page.md) |
| 4 | Epic tab: start hand-off, `/epic`, docs | ✅ | [04-epic-tab.md](04-epic-tab.md) |

## Open questions

- None

## Changelog

- 2026-11-11 — Spec created.
- 2026-11-11 — Phase 1: `nextAction` takes `phases: [{ n, done }]` rather
  than counts, so the held-phase check and `/spec-next`'s phase number come
  from the first unfinished phase file. A spec with no phase files is `idle`
  (no command) rather than `/spec-next`, which would refuse. The gate input
  splits `unknown` into `off` (opted out — silence) and `unreadable`.
- 2026-11-11 — Phase 2: the whole `epic status` human view is plain text now,
  not only the member table — the Ready now / In flight / Blocked / Done rows
  are gone, carried by the table. A bare form also resolves from a MEMBER's
  worktree (its `Epic:` header). The page's tier stack moved to phase 3, where
  the route it points at is built. `building` reads "building — nothing to run
  yet" so `status`, which shows no state column, still says it.
- 2026-11-11 — Phase 3: an epic still being authored keeps its `/spec`
  authoring page at `/<token>/epic-<name>` — the epic view applies only once
  its documents are committed, so the authoring verdict buttons are never
  replaced by a read-only page. `epic status` prints the page's tier stack, or
  the serve command when no server runs; it reads the server, never starts it.
- 2026-11-11 — Phase 4: `/spec-start` on an epic carries the epic page as its
  `Review` row (a page to come back to, so a row and never a banner) and names
  `/epic` beside the members to start. `docs/index.html` gained the `/epic`
  chip the published-docs check requires; its `verified:` was not bumped, since
  the rest of that page was not re-read.
