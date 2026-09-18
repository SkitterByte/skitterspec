---
linear_identifier: "SKS-367"
linear_url: "https://linear.app/skitterbyte/issue/SKS-367/the-review-wait-rides-a-persistent-monitor"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The review wait rides a persistent monitor

> **Type:** Feature
> **Name:** feat-persistent-wait (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-18)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** packages/common/assets/rules/spec-reports.md, packages/common/assets/skills/{spec,spec-next,spec-bug,no-spec}/, packages/common/test/
> **Stack:** worktree

## Problem

The end-of-phase wait (`spec-env review wait`, backgrounded) is killed by the
harness reclaiming idle background shells — observed at ~6, ~30 and ~43
minutes on 2026-09-18, after feat-wait-survives-idle (SKS-358) had already
shipped the heartbeat and the re-arm contract. Worse, the contract's
ambiguity clause ("where a death and a deliberate stop cannot be told apart,
treat it as deliberate") disabled the re-arm in exactly the common case: a
harness kill and an operator stop produce the same notification, so the safe
branch ate the whole recovery and the operator paid a `/spec-reviewed` for
every idle review. The operator's words: it "just makes friction and feels
unreliable".

## Decisions

1. **The wait rides a persistent watch primitive where the harness has one** —
   capability-first wording, with Claude Code's `Monitor` tool
   (`persistent: true`, stop via `TaskStop`) as the named example. Such a
   primitive is session-length by design, so the reaping that kills a
   background shell does not apply. Fallback where none exists: background the
   command exactly as today. Rejected: naming only Claude Code (the assets
   ship to any harness) and naming no tool at all (each session would have to
   rediscover what qualifies).
2. **A killed-task notification is a death, not a stop.** The clause inverts:
   re-arm silently on the same window **unless** there is positive evidence of
   a deliberate stop — this session called TaskStop, or the operator said to
   stop waiting. SKS-358's own evidence ruled TaskStop out of every observed
   kill, so treating ambiguity as deliberate protected against a case the
   record says does not occur, at the cost of the recovery it was shipped
   with. The 12-hour window bound is unchanged.
3. **The contract stays defined once, in `spec-reports.md`.** The four waiting
   skills (`/spec` C2, `/spec-next` §5, `/spec-bug` 5b, `/no-spec`) keep
   pointing at it; only the "run the engine's wait in the background" sentence
   gains the persistent-primitive preference. Two copies of a waiting rule is
   how the copies come to disagree.
4. **No engine change.** SKS-358 already put the heartbeat on stderr, so
   stdout is the single `arrived:` event a monitor needs; exit ends the watch
   and a crash surfaces as an exit code. The engine's wait remains the one
   watcher — the primitive only carries its lifetime.
5. **This repo's installed copies are re-synced** (`skitterspec update`) so
   the dogfood `.claude/` matches the assets in the same change.

## Solution overview

`spec-reports.md`'s wait section gains one paragraph: prefer a harness
persistent-watch primitive (survives idle; deliberate stop is an explicit
act), example Claude Code `Monitor` with `persistent: true`; else background
the command. Its re-arm paragraph is re-worded per decision 2 — death is the
default reading of a kill, deliberate stop needs positive evidence. Each
waiting skill's step 2 sentence points at the preference instead of
prescribing only the background form. Asset-pinning tests are updated to hold
the new sentences and to prove the old ambiguity default is gone.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | spec-reports.md — persistent-watch preference; death-vs-stop inversion |
| Skill/rule | update | spec, spec-next, spec-bug, no-spec — wait step names the preference |
| Test | update | asset-pinning tests for the reworded contract |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Amend the wait contract in spec-reports.md | ⬜ | [01-contract.md](01-contract.md) |
| 2 | Point the four waiting skills at it | ⬜ | [02-skills.md](02-skills.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | Ready | backlog | Reuben Greaves |
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-18 — Spec created, from the phase-4 wait of
  feat-docs-site-restructure dying under harness reaping and the re-arm
  never firing.
