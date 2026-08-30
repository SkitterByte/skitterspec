# Automatic teardown when a spec completes cleanly

> **Type:** Feature
> **Name:** feat-auto-teardown-on-complete (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 2 (started 2026-08-30)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-30
> **Area:** packages/common/src/env/teardown.js, packages/common/assets/skills/spec-complete/SKILL.md
> **Stack:** worktree

## Problem

`/spec-complete` step 7 says "offer — don't force" and waits for a yes before
reclaiming the spec's environment. By the time it runs, the branch has already
been rebased, fast-forwarded into base and re-tested green, so the prompt asks
about work that is provably safe to remove. Reclaiming the environment is what
`/spec-complete` is *for*; stopping to ask reads as a regression to the person
running it.

The prompt also cannot tell you anything the engine does not already know.
`planDown` computes `merged` (HEAD is an ancestor of base) and refuses a dirty or
unpushed-and-unlanded worktree on its own. Those guards are the real protection —
the confirmation is a second, weaker gate in front of them.

Separately, teardown's `git branch -d` **fails on almost every spec branch**.
`/spec-go` pushes the branch when it provisions, so at teardown the branch is
ahead of `origin/<branch>`; `-d` refuses that even when the branch is fully
merged into `main`. Observed on `feat-inline-phase-mapping`: teardown removed the
worktree, then refused the branch. Automating step 7 without fixing this would
automate a step that reliably half-fails.

## Decisions

1. **Automatic in `/spec-complete`, unchanged in `/spec-cancel`.** A completed
   spec's branch is provably an ancestor of base, so teardown can lose nothing. A
   cancelled spec's branch is abandoned work that was never landed — the guards
   would block auto-teardown anyway, and destroying work someone gave up on is a
   different risk from reclaiming work that shipped. `/spec-cancel` keeps its
   prompt.
2. **Fix the branch delete first, in its own phase.** `-d` refuses a branch ahead
   of its upstream ref; `merged` (ancestor of base) is strictly stronger than
   what `-d` checks, so where the engine has proven `merged` it can use `-D`
   safely. This is the same reasoning already applied to `tagLanded`
   (`teardown.js:97`) — the change generalises an existing exception rather than
   inventing one. Rejected: leaving `-d` and reporting the failure, which would
   make automatic teardown fail on every pushed branch.
3. **Auto-teardown is conditional on the landing having actually happened.**
   Only after step 6 lands (or reports "already landed") *and* the base suite is
   green. A rebase conflict, a work-loss abort or a red suite keeps today's
   behaviour: stop and report, tear nothing down. The precondition is what makes
   the confirmation redundant, so it has to be stated rather than assumed.
4. **`--keep-env` opts out.** Completing and then wanting to poke at the branch is
   a real case, and re-provisioning is not free. One flag, checked at the top of
   step 7.
5. **The volume prune stays confirm-first.** `spec-env prune` reaps volumes
   belonging to *other* specs — orphans from declined or aborted teardowns. "This
   spec landed cleanly" says nothing about those, so the reasoning that removes
   the teardown prompt does not extend to prune.

## Solution overview

Step 7 of `/spec-complete` stops asking and just runs, gated on the landing:

```
6. Land the branch          → rebase + ff, re-test on base
7. Reclaim the environment  → only if step 6 landed and the suite is green
     1–3  disconnect proxy · dev down · spec-env down   (automatic)
     4    spec-env prune                                 (still confirm-first)
```

`--keep-env` skips 1–3. A spec with no worktree, or a project with no
`env.config.json`, skips step 7 entirely as it does today.

Underneath, `planDown` emits `git branch -D` when the engine has proven the
commits are recoverable — `merged` (ancestor of base) or `reachableFromTag` (a
tagged hotfix) — and keeps `-d` for everything else, so a forced teardown of a
genuinely unmerged branch still fails loudly.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env down` emits `git branch -D` when `merged` |
| Skill/rule | update | `/spec-complete` step 7 runs without confirming |
| Skill/rule | add | `/spec-complete --keep-env` keeps the worktree |

`/spec-cancel`, the teardown guards and `spec-env prune` are unchanged.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Delete a merged branch that is ahead of its remote | ✅ | [01-branch-delete.md](01-branch-delete.md) |
| 2 | Tear down automatically on a clean completion | ⬜ | [02-auto-teardown.md](02-auto-teardown.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-30 | Ready | backlog | Reuben Greaves |
| 2026-08-30 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-30 — Spec created after `feat-inline-phase-mapping` completed: the
  teardown prompt was questioned as a regression, and the branch delete failed on
  the same run. Confirmed `offer — don't force` has been in the skill since
  `369c89e`, so the prompt is original rather than a regression — but it guards
  nothing the engine's own checks do not.
- 2026-08-30 — Phase 1: verified against real git that `-d`'s refusal is driven
  by the branch being ahead of its **upstream ref**, and corrected the spec's
  reasoning — `origin/<branch>` lags because the phase commits after `/spec-go`'s
  push were never pushed, not because landing fast-forwards base (which does not
  touch the remote ref). The fix is unchanged; the explanation was wrong.
