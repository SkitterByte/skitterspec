---
linear_identifier: "SKS-353"
linear_url: "https://linear.app/skitterbyte/issue/SKS-353/offer-the-unblock-instead-of-a-bare-refusal"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Offer the unblock instead of a bare refusal

> **Type:** Feature
> **Name:** feat-offer-the-unblock (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-18)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** `packages/common/src/env/live.js`, `packages/common/src/env/review.js`, `packages/common/src/cli.js`, `packages/common/assets/rules/`, `packages/common/assets/skills/spec-diff/`
> **Stack:** worktree

## Problem

A refusal is a dead end. `/spec-live` on a worktree with uncommitted work prints
what is wrong and stops; a commit refused by an armed review gate does the same.
Both are correct, and both leave the operator holding a command they now have to
reconstruct — and the second one, met in the wild, produced an immediate request
for a `--force` flag. That is the failure mode `spec-planning.md` already names:
**a gate whose exit nobody can reach gets switched off wholesale instead of
answered.**

The refusals are right. What is missing is the next step.

## Decisions

1. **The engine declares which refusals are offerable; the caller only relays.**
   A blocked result gains an `offer` — `{ kind, label, command }` — and a skill
   raises a picker only where the engine put one there. Rejected: leaving it to
   skill prose. The boundary that matters most here (never offer to clear work
   that is not the operator's) would then live only in prose, and this repo
   records prose failing to hold exactly that class of line twice.

2. **Two kinds of offer, and the distinction is the whole safety argument.**
   `kind: 'satisfy'` performs the thing the guard asked for — commit the phase,
   then go live. Nothing is weakened and no record is needed. `kind: 'bypass'`
   steps past a guard that is still unsatisfied, and it is recorded.

3. **A bypass may be raised by Claude, once, after the refusal has been
   relayed.** This is the decision that has to argue with
   `spec-planning.md`, which says Claude must not be able to lift a guard aimed
   at Claude — the line `/allow-main` and `/spec-skip` are both marked
   user-only to hold.
   It survives because **three things are true at once**, and a `--force` had
   none of them: the operator answers (Claude raises the question and cannot
   answer it); the choice is **recorded** where a flag recorded nothing; and it
   is offered **once per arming**, so the path of least resistance never becomes
   tapping through. What was rejected was a *reasonless, repeatable, silent*
   lift. This is a *recorded, once-only, human-answered* one.

4. **Once-only is held by the sidecar, not by the rule.** The gate stamps
   `offeredAt` when the engine declares a bypass offer, and declines to declare
   a second one for the same arming. Prose cannot hold this: a fresh context or
   a compaction loses the memory that it was already offered, and the rule would
   then be true only for as long as one conversation lasted.

5. **Commands are untouched.** `/spec-connect`, `/spec-live` and
   `/spec-remote-review` keep *"Relay the engine output verbatim. Add nothing and
   run nothing else"*, and keep their narrow `allowed-tools`. The picker lives
   where a **skill** is the caller — `/spec-diff` §2b acting on a live press,
   `/spec-next`, and a commit the gate refused — which is where the case that
   prompted this actually arrives. A typed `/spec-live` keeps its bare refusal.
   Rejected: widening `spec-live`'s `allowed-tools` so it could run the commit it
   offered. That reintroduces judgment to the surface the skills-vs-commands
   split exists to keep free of it.

6. **The offer never extends to work that is not the operator's.** A `live take`
   refused because *another spec* holds the workbench gets no offer, ever —
   `/spec-diff` §2b already forbids parking someone else's session, and a
   friendly picker is precisely how that would creep back in. The engine decides
   this by declaring no `offer`, so it is a property of the data rather than a
   rule someone has to remember.

7. **A bypass records a fixed reason string**, distinct from anything a person
   would type: the disarm reads `none: chose to commit without reading the diff`.
   Rejected: minting a third `DISARMED_BY` verb beside `verdict` and `skip`. The
   sidecar's vocabulary is versioned, and a distinct reason string already makes
   a tapped bypass tellable from a typed one — which is the only thing a third
   verb would have bought.

8. **The engine and the hook keep refusing regardless.** `AskUserQuestion` exists
   only in this harness, and the guards run from a plain CLI and from a
   `PreToolUse` hook. This is a layer on top of the refusal; it is never allowed
   to become the refusal.

## Solution overview

A blocked plan may carry one more field:

```js
{
  blocked: true,
  reason: "feat-x's worktree has uncommitted changes — commit or stash them…",
  offer: {
    kind: 'satisfy',                       // or 'bypass'
    label: 'Commit first, then go live',   // what the option says
    command: '/commit',                    // what running it means
  },
}
```

Absent stays absent: a refusal with no way out carries no `offer` key at all, and
every existing consumer sees exactly what it saw before.

A skill that hits a blocked result **relays the refusal first**, then — only if
`offer` is present — raises a two-option picker: the label, and Cancel. On
`satisfy` it runs the command and retries the original operation. On `bypass` it
runs the recorded disarm and proceeds. On Cancel it stops, and nothing is
recorded, because declining to bypass is not a decision anyone needs to audit.

The gate's own offer is additionally spent: declaring it stamps `offeredAt`, and
the same arming will not produce a second one.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Engine | add | `offer` on `planTake`'s blocked result |
| Engine | add | `offer` on `gateState` / `review gate` when armed |
| CLI command | update | `spec-env live`, `spec-env review gate` — `--json` carries `offer`; text names it |
| Config key | update | gate sidecar gains `offeredAt` (gitignored, `GATE_VERSION` unchanged) |
| Skill/rule | add | `.claude/rules/offered-unblocks.md` — the contract, once |
| Skill/rule | update | `/spec-diff` §2b acts on a declared offer |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The engine declares an offer | ✅ | [01-engine-declares-an-offer.md](01-engine-declares-an-offer.md) |
| 2 | The gate remembers it offered | ⬜ | [02-gate-remembers-it-offered.md](02-gate-remembers-it-offered.md) |
| 3 | The skills raise the picker | ⬜ | [03-skills-raise-the-picker.md](03-skills-raise-the-picker.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | Ready | backlog | Reuben Greaves |
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-18 — Spec created. Grew out of `bug-live-press-does-nothing`
  (SKS-345), which shipped `/spec-skip` as the gate's typed exit; this is the
  offered one.
- 2026-09-18 — Phase 1: added `--json` to `spec-env live take`, which had no
  machine-readable surface — phase 3's picker would otherwise have had to scrape
  the refusal text. Decided the armed gate keeps its existing text exit rather
  than also printing the bypass command: a pre-canned reason in a terminal
  invites pasting it unread.
