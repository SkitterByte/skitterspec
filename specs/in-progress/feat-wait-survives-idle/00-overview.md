---
linear_identifier: "SKS-358"
linear_url: "https://linear.app/skitterbyte/issue/SKS-358/the-review-wait-survives-a-long-idle"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The review wait survives a long idle

> **Type:** Feature
> **Name:** feat-wait-survives-idle (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-18)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** `packages/common/src/env/review.js`, `packages/common/src/cli.js`, `packages/common/assets/rules/spec-reports.md`, `packages/common/assets/skills/{spec,spec-next,spec-bug,no-spec}/`
> **Stack:** worktree

## Problem

A phase that ends renders its page, backgrounds `spec-env review wait`, and
tells the reader **"I'm holding here until you send a verdict."** Over a long
idle that wait is killed, and nothing says so — the session simply stops
watching while the banner goes on claiming it is holding.

Observed on 2026-09-18: three separate agent sessions left before lunch each
reached a review and each lost its wait, and two waits in one session were killed
after **43m25s** and **29m40s**.

Ruled out by evidence: machine sleep (no `pmset` sleep events in either window),
a broad reap of the session's processes (the detached review serve daemon
survived 2h15m through both kills), a fixed timeout (the two durations differ),
and `TaskStop` (never called). The one contrasting case is a wait that exited
**0** normally after 8m47s — because a verdict arrived and it printed output.

**No pass is ever lost.** They sit in the pending store with a code and
`/spec-reviewed` claims them. What is lost is the wake-up, and what is wrong is
the promise — which is the exact failure `spec-reports.md` records: *a watch that
cannot fire and one patiently working look identical.*

## Decisions

1. **Fix the mechanism; do not soften the promise.** The banner keeps saying
   "I'm holding here until you send a verdict", because after this spec it is
   true. Rejected: rewording it to promise less. `spec-reports.md` records that
   it has taken two amendments already and that *"a third should have to argue
   harder than either did"* — and a softer promise spends that credibility on a
   problem the mechanism can solve, while teaching readers that the button may be
   decorative. That is the failure the section exists to prevent.

2. **Two mechanisms, because only one of them is proven.** The diagnosis is
   incomplete: whether the trigger is **process silence** or **session idleness**
   is not established, and the design must work either way.
   - A **heartbeat**, which addresses silence — cheap, engine-only, and harmless
     if the hypothesis is wrong.
   - **Re-arming on an unexpected death**, which addresses *every* cause,
     because both kills **did** deliver a task notification. The wake-up channel
     works; it is the watch that does not.

3. **The heartbeat goes to stderr.** Stdout is the event stream — under a
   monitor every stdout line becomes a notification, and under a backgrounded
   Bash task stdout is the result the caller parses. Stderr reaches the output
   file without raising either, so the process stops being silent at no cost to
   anyone reading it.

4. **Re-arming is silent and reuses the same `--since`.** A death is not an
   event worth a report: nothing happened, and the window is unchanged, so a
   pass that arrived during the gap is still inside it and still claimable.
   Re-arming on a *fresh* timestamp would strand exactly that pass.

5. **The bound is elapsed time, not a count of re-arms** — 12 hours from the
   original `--since`. A count means something different depending on whether
   deaths come every 5 minutes or every 45, and the observed interval already
   varies from 30 to 45. Time is what the operator actually experiences.

6. **12 hours deliberately does not cover an overnight gap**, and that is the
   right trade rather than an oversight. Someone leaving at 18:00 and returning
   at 09:00 falls outside it — but the pass is never lost, and `/spec-reviewed`
   is the designed recovery. The alternative is a session waking every half hour
   all night for a review nobody is coming back to before morning.

7. **Once the bound expires the banner degrades**, to the sentence the contract
   already defines for a transport that cannot push into the conversation:
   *press a verdict, then type `/spec-reviewed` — I cannot see it until you do.*
   This is a **new state** for an existing sentence, not a new sentence, so
   `spec-reports.md` gains a state rather than an amendment.

8. **It ships whole, in one phase** — chosen against the recommendation to land
   the heartbeat alone first. A partial landing leaves the banner able to lie,
   which is the defect itself; splitting it would mean shipping a fix that is
   only correct if the unproven half of the diagnosis is right.

## Solution overview

**Engine.** `specEnvReviewWait` starts a heartbeat alongside the poll loop,
writing one line to **stderr** every 5 minutes:

```
spec-env review wait: feat-x — still waiting (18m), window since 2026-09-18T09:57:22Z
```

The poll itself is unchanged at 400ms; the heartbeat is an independent cadence
and is suppressed under `--json`, which has one machine-readable payload and must
not gain a second stream.

**Skills.** A wait that ends **without** a verdict and **without** the operator
stopping it is re-armed on the same `--since`, silently, while the window is
younger than 12 hours. Past that the run stops re-arming and the banner switches
to its degraded state. Ordinary endings are untouched: a verdict arrived
(`arrived`), two did (`ambiguous`), or the window was unusable — each routes
exactly as it does today.

The four skills that wait share one description of this, in
`.claude/rules/spec-reports.md` beside the banner it keeps true.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review wait` — stderr heartbeat, `--heartbeat <seconds>` to tune, `0` to disable |
| Engine | update | `waitForPass` accepts an `onHeartbeat` hook; poll cadence unchanged |
| Skill/rule | update | `spec-reports.md` — the re-arm contract and the degraded banner state |
| Skill/rule | update | `/spec`, `/spec-next`, `/spec-bug`, `/no-spec` — point at the rule rather than restating it |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The wait survives, and says so honestly when it cannot | ✅ | [01-survive-and-degrade.md](01-survive-and-degrade.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | Ready | backlog | Reuben Greaves |
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-18 — Phase 1 built. Verified end to end that the heartbeat reaches
  **stderr and not stdout**: with stderr discarded, stdout carries only the
  start line and the result. That split is what lets the beat exist at all —
  stdout is the parsed answer, and every stdout line is a notification under a
  monitor.
- 2026-09-18 — The elapsed figure rounds to whole minutes, so a sub-minute
  cadence reads `(0m)`. Left as is: the shipped cadence is five minutes, and
  `--heartbeat` below that is a test affordance.

- 2026-09-18 — Spec created, from three sessions losing their wait over one
  lunch break. Cause narrowed but not proven, so the design covers both
  candidates (decision 2).
