---
linear_identifier: "SKS-214"
linear_url: "https://linear.app/skitterbyte/issue/SKS-214/the-write-discipline-follows-the-worktree-not-the-flag"
---

# The write discipline follows the worktree, not the flag

> **Type:** Feature
> **Name:** feat-guard-follows-the-worktree (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-14
> **Area:** packages/common/assets/skills/spec-next/SKILL.md, packages/common/assets/skills/spec-diff/SKILL.md, packages/common/test
> **Stack:** worktree

## Problem

`/spec-next` can build a spec from a session that is not standing in its
worktree. Two routes get there, and only one of them is protected.

`--worktree <path>` is protected in full: §3 records a baseline with
`--record-primary`, requires every write to be an absolute path and every
command to be `cd`-prefixed, and §4b proves nothing leaked with
`--assert-primary-clean`.

**Rung 4 reaches the same place with none of it.** `bug-next-refuses-the-only-spec`
(SKS-196) added it so a bare `/spec-next` resolves the sole provisioned spec via
the engine rather than refusing — which is right, and it is how the operator hit
this. But rung 4 was added to §1 and never followed through to §3, §4b or the
frontmatter. Both protections are gated on the **shape of the invocation**
(*"Only when this run was given `--worktree`"*) rather than on the fact that
makes them necessary, so a bare `/spec-next` typed from the primary checkout on
`main` builds a phase into another tree with no `cd` discipline and no leak
check. One relative path puts the edit on the base branch, and nothing looks
wrong at the time.

The frontmatter is already lying about this. It promises the skill *"builds one
elsewhere only when handed its worktree path"* — untrue since SKS-196 landed, and
it is what the router reads.

`/spec-diff` has the same hole and less cover. Its §2.3 makes real code changes
on the go-ahead, and it resolves by name argument — so it too can write into a
worktree the session is not standing in. It has no `cd` discipline and no leak
guard at all.

## Decisions

1. **Gate on the fact, not the flag.** The discipline and the assertion apply
   whenever the **resolved worktree is not this session's cwd**, however the spec
   was resolved. This is SKS-196's own reasoning applied one step further along:
   condition on a positive fact that is on disk and checkable, never on the shape
   of the call. The current gating is an absence test on an invocation flag, and
   rung 4 is precisely the case it cannot see.
2. **Rejected: `cd` the session in on rung 4 and call it fixed.** It is the
   obvious move — `/spec-start` already does it — but a `cd` is a convenience.
   It can silently not happen, and it can be dropped by a later edit that reads
   it as redundant. The same split `feat-review-verdict` draws holds here: the
   `cd` would be the courtesy, the assertion is the guarantee. Adding the `cd`
   later stays open; it is not what makes this safe.
3. **`--worktree` stays exactly as it is.** It is how `/spec-start` hands off
   into phase 1 without moving the session, and it remains the explicit,
   validated path. Only the *gating* of §3 and §4b changes — the flag loses its
   monopoly on the discipline, not its own behaviour.
4. **The frontmatter description is part of the defect, not a tidy-up.**
   *"builds one elsewhere only when handed its worktree path"* is false today and
   contradicts §1's rung 4. A description that contradicts the body is worse than
   a vague one, for the reason `assets-spec-next-worktree.test.js` already
   records: it is what the router reads.
5. **`/spec-diff` gets the discipline, and it is not a precondition.** §3's
   *"gate it on nothing"* rule stays whole and untouched. A write discipline
   changes **how** the skill writes, never **whether** it runs — a half-finished
   phase, a hand edit and a colleague's branch are still all ordinary inputs.
6. **No engine change.** `packages/common/src/env/building.js` is already
   generic: `--record-primary` / `--assert-primary-clean` know nothing about
   `--worktree`, and `compare()` already returns `unknown` when the worktree *is*
   the primary checkout, so `checkout` mode stays silent for free. The bug is two
   skills that do not ask.
7. **Name one blind spot rather than close it.** `--assert-primary-clean` watches
   the **primary checkout** only. A build run from inside *another spec's*
   worktree would leak there unseen. It stays unhandled — reaching it takes an
   explicit `--worktree` typed from a second worktree — but it gets a comment
   beside the check, per `negative-checks.md` rule 2.

## Solution overview

The condition in both skills becomes one sentence, checked against the engine:

```
resolved worktree (spec-env resolve → worktree:)  vs  this session's cwd
   same  → standing in it; the discipline is inert, 4b claims nothing
   differ → absolute writes, cd-prefixed commands, baseline before, assert after
```

`--record-primary` before the first write; `--assert-primary-clean` after
progress is recorded and before anything is reported done. Both already behave
correctly on every path — including `checkout` mode, where the two trees are one
and the engine answers `unknown` rather than accusing.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `/spec-next` §3 — write discipline + `--record-primary` gated on worktree ≠ cwd |
| Skill/rule | update | `/spec-next` §4b — heading and precondition rewritten off the flag |
| Skill/rule | update | `/spec-next` frontmatter — description no longer claims `--worktree` is the only remote path |
| Skill/rule | update | `/spec-diff` §2.3 — gains the discipline, the baseline and the assertion |
| Test | update | `assets-spec-next-worktree.test.js` — 3 assertions pin the old gating |
| Test | add | stays-silent cases: standing in the worktree, and `checkout` mode |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-next` — the discipline follows the worktree | ⬜ | [01-next-discipline.md](01-next-discipline.md) |
| 2 | `/spec-diff` — the same discipline where it writes | ⬜ | [02-diff-discipline.md](02-diff-discipline.md) |

## Non-goals

- **`cd`-ing the session into the worktree on rung 4.** Decision 2. It may well
  be worth doing; it is not what makes this safe, and bundling it here would let
  the guard be read as redundant.
- **Auditing every skill for the pattern.** `/spec-next` and `/spec-diff` are the
  two that write code into a resolved tree. Stating it once as a shared contract
  across the whole skill set is a bigger change than this defect warrants.
- **Watching trees other than the primary checkout.** Decision 7 — documented,
  not closed.
- **Any engine change.** Decision 6.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-14 — Spec created, out of a bare `/spec-next` being considered from
  `main` while `feat-review-verdict` was the sole provisioned spec. Rung 4 would
  have resolved it correctly and then built it with neither the `cd` discipline
  nor the leak check, because both are gated on `--worktree`. Written as the
  follow-through SKS-196 did not do rather than as a fix to SKS-196: rung 4 is
  right, and its §1 change was simply never carried into §3, §4b and the
  frontmatter.
