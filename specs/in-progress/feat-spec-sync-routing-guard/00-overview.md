---
linear_identifier: "SKS-127"
linear_url: "https://linear.app/skitterbyte/issue/SKS-127/route-every-user-facing-spec-sync-verb-and-guard-that-it-stays-routed"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Route every user-facing spec-sync verb, and guard that it stays routed

> **Type:** Feature
> **Name:** feat-spec-sync-routing-guard (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 2 (started 2026-09-10)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-09
> **Area:** packages/linear/assets/skills/spec-sync/SKILL.md, scripts/docs-claims.test.js
> **Stack:** worktree

## Problem

`/spec-sync` is the front door for repo-wide sync work, and its routing table is
what turns a user's words into a verb. Four verbs a human is expected to type —
`credentials`, `whoami`, `users`, `stage` — are not in it, so asking "who am I in
Linear?" reaches nothing. `list` had the same gap until it was noticed by hand
after shipping.

Nothing catches this. The repo already guards the **docs site** in both
directions — a verb the site never mentions fails the suite — but no check
connects a shipped verb to the skill that is supposed to route it. Each of these
four shipped with a feature that documented the verb properly and never came back
to the skill.

## Decisions

1. **"Used by: you" is the definition of routable, and the docs site already
   records it.** Every `spec-sync` row on `docs/linear.html` carries a "used by"
   column — `you`, a skill name, or `internal`. A verb a human types must be
   reachable from `/spec-sync`; one a skill drives is that skill's business.
   *Rejected:* a hand-maintained allowlist in the test (the existing
   `undocumented: {}` shape). It would put the same classification in two places,
   and the site's copy is already guarded for accuracy, so the second one could
   drift while every test stayed green.
2. **The guard reads the routing TABLE, not the skill's prose.** `docs-claims`
   has learned this twice already (`spec-env is` matched in a sentence and
   demanded a verb called `is`). A verb named in a code sample or an aside is not
   routed, and a prose match would report the exact gap this spec exists to close
   as already fixed. The table is what maps words to a verb; reference sections
   are not.
3. **Deferral is a legitimate answer and must stay expressible.** `push` and
   `status` are deliberately *not* routed — `/spec-sync` hands them to
   `/spec-push` and `/spec-status`, and says so. Those carry a skill name in
   their used-by, so decision 1 already exempts them; the guard needs no special
   case and must not grow one.
4. **The four routes land before the guard.** Added in the other order the guard
   fails on `main` until the routes catch up, which is a red suite for a gap that
   was already there.

## Solution overview

Phase 1 adds four rows to the `/spec-sync` routing table. Phase 2 adds one guard
to `scripts/docs-claims.test.js`, which already parses both the docs pages and
the shipped skills tree.

The rule, derived per verb from the site's own used-by cell:

```
used by: you        → must appear in /spec-sync's routing table
used by: <skill>    → exempt; that skill owns it
used by: internal   → exempt
```

A new verb is classified once, on the docs row it already has to have — the
existing guard fails the suite for any verb the site does not mention at all, so
there is no path to a verb with no classification.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `spec-sync/SKILL.md` — routing rows for `credentials`, `whoami`, `users`, `stage` |
| Test | add | `docs-claims.test.js` — routed-or-exempt guard, plus its stays-silent cases |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Route the four user-facing verbs | ✅ | [01-route-the-verbs.md](01-route-the-verbs.md) |
| 2 | The guard that keeps them routed | ✅ | [02-guard.md](02-guard.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | Ready | backlog | Reuben Greaves |
| 2026-09-09 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-09 — Spec created. Raised after `spec-sync list` shipped documented on
  the site but unrouted by the skill; four older verbs turned out to have the
  same gap.
- 2026-09-10 — Phase 1: the four rows went in below `released` rather than
  beside the read-only verbs at the top. The table reads roughly
  read → write → setup, and `credentials`/`whoami`/`users` are setup-shaped;
  putting them above `apply --all` would have pushed the one row with real blast
  radius further down the table.
- 2026-09-10 — Phase 1: the tests parse the routing table by slicing from its
  header row to the first blank line, and assert the slice actually found rows.
  That reader is what phase 2's guard will reuse, so it is worth it being strict
  here first — a table matcher that silently finds nothing would let both phases'
  checks pass forever.
- 2026-09-10 — Phase 2: the guard found a **fifth** unrouted verb on its first
  run — `doctor`. The spec named four because the hand analysis grepped only
  `case '<verb>':`, and `doctor` dispatches as `sub === 'doctor'` (it runs
  before the config is loaded, since reporting a broken config cannot require a
  working one). The guard reads both forms because it reuses `docs-claims`'
  existing matcher, which is exactly why deriving from an existing reader beat
  writing a new one.
- 2026-09-10 — Phase 2: routing `doctor` then tripped the *reverse* guard that
  already existed — `every spec-sync verb the skill routes to is a real
  subcommand` — which recognised only `case '<verb>':`. It accused a verb that
  dispatches perfectly well: the same narrow-lookup failure
  `.claude/rules/negative-checks.md` opens with, sitting in a check written to
  prevent it. Widened to accept either form, with the blind spot named beside it.
