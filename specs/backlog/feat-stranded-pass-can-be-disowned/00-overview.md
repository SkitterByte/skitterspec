---
linear_identifier: "SKS-304"
linear_url: "https://linear.app/skitterbyte/issue/SKS-304/a-stranded-review-pass-can-be-disowned"
---

# A stranded review pass can be disowned

> **Type:** Feature
> **Name:** feat-stranded-pass-can-be-disowned (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-16
> **Area:** packages/common/src/cli.js, packages/common/assets/skills/spec-complete/SKILL.md, packages/common/assets/skills/spec-cancel/SKILL.md
> **Stack:** worktree

## Problem

`spec-env review waiting` lists every pass nobody heard, and ends by printing
`disown one with: skitterspec spec-env review <spec> --drop <code>`. That command
cannot work for any pass it lists. All ten currently waiting belong to specs that
have completed and been torn down, and `specEnvReview` refuses on a missing
worktree (`cli.js:2046`) before it ever reaches `--drop` (`cli.js:2227`).

The pending store is `.spec-env/reviews/<spec>.pending.json` in the **primary
checkout**. Disowning a pass reads and writes that file and nothing else — the
worktree it is being refused for is not involved.

So the feature that went looking for stranded passes found ten and handed the
operator a command that exits without dropping anything. Its own phase 3 notes
called the clear-out "a one-off `--drop`", which is the assumption this breaks.

Reported by the line the run prints every time: the pass stays listed until the
reader stops reading the line, which is how the real one gets missed.

## Decisions

1. **Relax the gate for sidecar-only work, not for the rest.** `--drop` moves
   ahead of the worktree check; the render, `--claim`, `--claim-since`,
   `--notes`, `--verdict` and `--resolve` keep it. Rejected relaxing the whole
   command: those paths read the diff with `git -C <worktree>` or act on a
   verdict, and both need the tree.
2. **Disown only — a stranded pass is never claimable.** Once the branch has
   merged and the worktree is gone, a `commit` verdict has nowhere to land, so
   honouring one would report work that did not happen. The refusal stays and
   gets a better message. Rejected claiming-for-the-record: it invents a
   claimed-but-never-acted state nothing else in the design has.
3. **The refusal names the exit that works.** A reader whose pass is stranded is
   told `--drop` and `spec-env review waiting`, rather than
   `run /spec-start to provision it` — which is advice to resurrect a completed
   spec in order to throw away a pass.
4. **Teardown reports, and never blocks.** `/spec-complete` and `/spec-cancel`
   surface a pass still waiting for *this* spec before the teardown they already
   confirm. A waiting pass is information, not a gate — the landed phase 3 is
   explicit about that, and the confirmation is already the operator's decision
   point.
5. **Phase 2's value is actionability, not reachability.** After phase 1 nothing
   is unreachable, so the warning is not "you will lose this". It is that
   teardown is the **last moment the verdict can still be honoured**: before it,
   a `commit` pass can be claimed and acted on; after it, only disowned.
6. **No bulk drop.** Clearing the ten is ten invocations in one paste. Rejected
   `--drop-all`: it discards unread verdicts by construction, which is the exact
   thing `/spec-diff` §0 exists to prevent. Rejected multiple codes per call as a
   flag shape that would be used once.
7. **Written as a Feature though phase 1 is a defect.** Phase 2 is new behaviour,
   so the work is one spec rather than a `/spec-bug` and a `/spec`. Phase 1 still
   gets the red→green discipline: its first task is the failing test.

## Solution overview

Phase 1 reorders `specEnvReview` so the branch that only touches the pending
sidecar runs before the worktree check, and rewrites the refusal the other paths
emit. Then the ten waiting passes are dropped, with their codes recorded.

Phase 2 adds one report line to the two teardown skills, read from
`spec-env review waiting --json` and filtered to the spec being finished.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review <spec> --drop <code>` works with no worktree |
| CLI command | update | refusal text for the worktree-requiring paths names `--drop` + `review waiting` |
| Skill/rule | update | `spec-complete`, `spec-cancel` report this spec's waiting pass pre-teardown |
| Data | remove | the ten stranded passes in `.spec-env/reviews/*.pending.json` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Disowning stops needing a worktree | ⬜ | [01-disown-needs-no-worktree.md](01-disown-needs-no-worktree.md) |
| 2 | Teardown says what it is about to strand | ⬜ | [02-teardown-names-the-pass.md](02-teardown-names-the-pass.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-16 — Spec created. Surfaced by `/spec-reviewed commit` finding no spec
  in flight, then `review waiting` listing ten passes none of which its own hint
  could clear.
