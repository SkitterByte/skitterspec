---
linear_identifier: "SKS-320"
linear_url: "https://linear.app/skitterbyte/issue/SKS-320/three-links-labelled-and-you-pick-the-one-that-reaches-you"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Three links, labelled, and you pick the one that reaches you

> **Type:** Feature
> **Name:** feat-three-review-links (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-17)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-17
> **Area:** packages/common/src/cli.js, packages/common/src/env/config.js, packages/common/src/env/review.js, .claude/rules/spec-reports.md, packages/common/test/
> **Stack:** worktree

## Problem

The engine offers **one** review link, chosen by guessing where the reader is
sitting — and the guess is wrong whenever the reader moves. A page opened on the
LAN stops working off-network; a reader who left the house cannot read the
review at all, and nothing on screen says which link would have worked.

That guess has now failed in three different ways in one day: detection reported
`unknown` on a local session and produced a `file://` page whose buttons cannot
POST; it reported `remote` and produced a LAN URL that a phone off the network
could not reach; and it flipped `unknown` → `remote` mid-session, changing the
address underneath a reader. Each was fixed. The next reader position will break
it again, because **the engine cannot know where the reader is** and keeps being
asked to.

So stop asking. List every surface that is turned on, labelled, and let the
reader pick the one that reaches them.

## Decisions

1. **Three tiers, named on the render: `local`, `network`, `remote`.** Two new
   settings decide which are on — `review.allowNetwork` and
   `review.allowRemote`. `local` has no setting because it is the machine the
   page is on; there is nothing to permit.
2. **Local and network are two doors into one room**, and that is what makes
   listing both safe. The page POSTs with `fetch(location.pathname, …)`, so a
   page opened at `127.0.0.1:7760/…` and one at `192.168.0.136:7760/…` reach the
   same server process and the same pending store — one `review wait` covers
   both.
3. **`.claude/rules/spec-reports.md`'s one-link rule is amended, not broken.**
   Its stated objection is that the reader cannot know which door the run stands
   behind; between local and network there is only one room, so the objection
   does not apply. It becomes **one link per reachable store, each labelled** —
   and `remote` stays the exception, because a published page writes to the
   artifact's own store and a verdict there needs `/spec-reviewed`.
4. **`remote` means published, and only on demand.** Ticking `allowRemote`
   permits publishing; it does not publish every render. Each publish leaves a
   claude.ai page skitterspec cannot delete, so one per render would accumulate
   permanently — today's session alone would have produced eight. Rejected a
   tunnel, which would put all three tiers in one store and is the right answer
   in principle: it needs a service skitterspec does not have and would depend
   on.
5. **A disabled tier is listed, greyed, with the command that enables it** —
   `spec-env review allow network` / `allow remote`. Rejected a toggle **on the
   page**: today the page can only queue a pass, and that limit is what makes an
   open port defensible — a control that flips network exposure would let
   anything reaching the page widen it. This was the one question left
   unanswered when the spec was written, so it is decided the safe way and
   recorded for reopening.
6. **The bind comes from `allowNetwork`, not from detection.** That is the last
   thing reader detection decided, so after this it decides only wording on a
   failed serve. If a later change leaves it deciding nothing, it should be
   removed rather than kept as a vestige.
7. **Defaults: local and network on, remote off.** It matches what the engine
   already does, and publishing is permanent so it never happens unasked.

## Solution overview

`review.allowNetwork` (default true) and `review.allowRemote` (default false)
join `review.serve`. The render prints one line per tier — `local`, `network`,
`remote` — each either a URL or a greyed line naming the command that turns it
on. `allow network` / `allow remote` write the setting and say what changed. The
report's banner carries the same stack, and `spec-reports.md` is amended so the
shape is defined once rather than improvised per skill.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `review.allowNetwork` (true), `review.allowRemote` (false) |
| CLI command | add | `spec-env review allow <network\|remote> [--off]` |
| CLI command | update | the render lists every tier, enabled or not |
| Skill/rule | update | `spec-reports.md`: one link per reachable store, labelled |
| Business rule | update | the bind follows `allowNetwork`, not reader detection |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The tiers, and what turns them on | ⬜ | [01-the-tiers.md](01-the-tiers.md) |
| 2 | The render stacks them, labelled | ⬜ | [02-the-stack.md](02-the-stack.md) |
| 3 | The banner and the amended rule | ⬜ | [03-the-rule.md](03-the-rule.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-17 | Ready | backlog | Reuben Greaves |
| 2026-09-17 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-17 — Spec created after a reader off the network could not open the
  review at all. Raised deliberately as a hammer for this nut: three separate
  one-link failures were each fixed on their own, and the next reader position
  would have produced a fourth.
