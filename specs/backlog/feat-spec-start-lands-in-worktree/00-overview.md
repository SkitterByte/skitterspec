---
linear_identifier: "SKS-177"
linear_url: "https://linear.app/skitterbyte/issue/SKS-177/spec-start-lands-you-in-the-worktree"
---

# /spec-start lands you in the worktree

> **Type:** Feature
> **Name:** feat-spec-start-lands-in-worktree (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-12
> **Area:** packages/common/assets/skills/{spec-start,spec-complete,spec-cancel}/SKILL.md, packages/common/assets/rules/spec-planning.md, packages/common/README.md, packages/common/assets/core/env.config.md, packages/common/test/assets-spec-start-one-path.test.js, packages/common/test/assets-spec-start-offer.test.js, packages/common/test/assets-teardown-exit.test.js, MIGRATION.md
> **Stack:** worktree

## Problem

In `worktree` mode a bare `/spec-next` typed after a bare `/spec-start`
**always refuses**. `/spec-start` provisions the worktree and explicitly leaves
the session where it was (`spec-start/SKILL.md:106` — "The session does not
move"), while `/spec-next` resolves a spec from exactly three signals: the live
spec of the checkout, the worktree the session is standing in, or the branch in
`checkout` mode. From the primary checkout on `main`, none of them can ever
answer. Starting a spec and then building its first phase — the workflow's
central loop — cannot be driven by typing the two commands it is named after.

**This was built, shipped, and then deleted by accident.**
`feat-spec-start-same-tab` (SKS-104, complete 2026-09-09) did exactly this: its
decision 1 had `/spec-start` switch the session in, and its decision 3 noted that
`/spec-next` needed no change because rule 2 "starts answering on its own once
the session actually moves". `feat-phase-review` phase 5 (SKS-143) then stripped
the tab machinery — correctly removing `open.command`, which spawned a *new*
terminal and had been made redundant by `/spec-diff` — and in the same task list
deleted the `EnterWorktree` step, which moved the *current* session. Different
mechanisms, swept together.

The asymmetry it left proves it was a sweep rather than a decision: SKS-104 added
an enter half **and** an exit half, and only the enter half went. `/spec-cancel`
and `/spec-complete` still carry the exit half today, still asserting
"`/spec-start` moved this session in — the normal path in `worktree` mode", with
`assets-teardown-exit.test.js` pinning that claim green against a codebase that
no longer satisfies it.

## Decisions

1. **`/spec-start` ends with the session in the spec's worktree.** This restores
   SKS-104's intent, and `/spec-next` needs no new resolution rule — its rule 2
   answers by itself, exactly as that spec's decision 3 said. *Rejected:* giving
   `/spec-next` a fourth rule that reads the provisioned-spec registry. It treats
   the symptom, and it only ever resolves when a single spec has a worktree —
   which is the rare case in a workflow whose entire point is several at once.
2. **The move is a plain `cd`, never `EnterWorktree`.** The Bash working
   directory persists across calls, and the engine's zero-arg resolution reads
   `process.cwd()` (`provisionedSpecChoice`, `packages/common/src/cli.js:899` —
   "Standing inside a spec's worktree names it outright"). A `cd` therefore
   satisfies rule 2 with no permission prompt. *Rejected:* restoring the
   `EnterWorktree` call — its approval prompt is unusable on mobile and leaves
   the session stuck, which is why it must stay absent.
3. **The existing "no shipped surface mentions `EnterWorktree`" guard stays and
   changes meaning.** It was written to prove the tab machinery was gone; it now
   protects the mobile constraint. Keeping it is what stops decision 2 eroding
   back into a tool call the next time someone reads SKS-104.
4. **Housekeeping keeps its `git -C <worktreePath>` prefix.** Once the session is
   in the worktree a bare `git` would be equivalent, and SKS-104's decision 2
   dropped the prefix for that reason. Keep it anyway: the prefix is immune to
   the one failure this spec introduces — a `cd` that silently did not take —
   whereas a bare `git` would write the spec's move into the primary checkout on
   the base branch, which is precisely the leak `--assert-primary-clean` exists
   to catch. Costs nothing, removes a whole failure mode.
5. **Assert the move landed; never assume it.** After the `cd`, confirm a
   positive signal — `skitterspec spec-env resolve` with no argument naming this
   spec — rather than inferring success from the absence of an error. Per
   `.claude/rules/negative-checks.md` rule 1. If it does not name the spec, say
   so and fall back to the documented hand-off rather than building.
6. **`/spec-start` keeps its "build phase 1 now?" question, simplified.** The
   session is already in the worktree either way, so "hand off" stops meaning
   "open another session" and starts meaning "type `/spec-next` when you like".
   *Rejected:* always carrying on — one `yes` to `/spec-start` should not commit
   the operator to a full phase build whose size only they can judge.
7. **`/spec-next --worktree <path>` stays exactly as it is.** It is the explicit
   way to build a spec the session is *not* standing in, it is unreachable by
   guessing, and removing it is unrelated churn. It simply stops being the normal
   path.
8. **The teardown exit collapses to one `cd`, and `ExitWorktree` leaves the
   codebase.** The block's *reasoning* is correct and load-bearing — `git
   worktree remove` succeeds on the tree you occupy, and everything after it dies
   with `Unable to read current working directory` — so it survives unchanged.
   Its two branches do not: a `cd`-moved session and a hand-opened terminal now
   want the identical action, and the branch that says to call `ExitWorktree`
   would be both a no-op (the skill's own prose says it does nothing outside a
   session it moved) and a forbidden tool call. *Rejected:* leaving those skills
   alone — today the block is unreachable and therefore harmless, but decision 1
   makes it reachable for the first time.

## Solution overview

`/spec-start` step 3 gains one deliberate move and one check, in the bootstrap
call it already makes:

```
cd "<worktreePath>" && <the planner's "then, in the worktree, run:" steps>
```

That `cd` persists, so the session is now in the worktree. Prove it before
relying on it:

```
skitterspec spec-env resolve        # must name this spec
```

Step 6 then reads:

```
worktree ready — this session is now in it:
  <worktreePath>

build phase 1 now?
  yes -> carries on into /spec-next
  no  -> you are already there; type /spec-next whenever you like
```

And in `/spec-complete` · `/spec-cancel`, the two-branch exit becomes one:

```
**Standing in the worktree? Leave before you tear it down.**
`cd` to the primary checkout first — teardown removes this directory, and
`git worktree remove` succeeds on the tree you occupy rather than refusing.
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | update | `/spec-start` — move the session in; assert it landed; simplify step 6 |
| Skill | update | `/spec-complete`, `/spec-cancel` — collapse the exit to a `cd` |
| Skill | none | `/spec-next` — unchanged; rule 2 starts answering (decision 1) |
| Rule/doc | update | `spec-planning.md:48`, `README.md:139`, `env.config.md` |
| Doc | update | `MIGRATION.md` — behaviour change on the pending major |
| Test | update | `assets-spec-start-one-path.test.js`, `assets-spec-start-offer.test.js`, `assets-teardown-exit.test.js` |
| Config key | none | no engine change — `bug-spec-env-cwd-anchor` already anchors `.spec-env` to the primary checkout |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-start` lands the session in the worktree | ⬜ | [01-land-in-worktree.md](01-land-in-worktree.md) |
| 2 | Collapse the teardown exit to a `cd` | ⬜ | [02-teardown-exit.md](02-teardown-exit.md) |
| 3 | Sweep the shipped surfaces and the migration note | ⬜ | [03-surfaces-and-migration.md](03-surfaces-and-migration.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-12 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-12 — Spec created, from a `/spec-start` → `/spec-next` handoff that
  refused in ordinary use. Traced to SKS-143 phase 5 deleting SKS-104's enter
  half as tab-machinery collateral, leaving its exit half in place.
