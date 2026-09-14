---
linear_identifier: "SKS-245"
linear_url: "https://linear.app/skitterbyte/issue/SKS-245/the-review-explains-itself-and-ends-where-you-are"
---

# The review explains itself, and ends where you are

> **Type:** Feature
> **Name:** feat-seamless-review-loop (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-14
> **Area:** packages/common/src/env/review.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec-next/SKILL.md, packages/common/assets/rules/spec-reports.md, packages/common/test
> **Stack:** worktree

## Problem

Two gaps, both about the moment a review is actually read.

**The page opens on a file list.** It knows the spec's name, its branch and its
totals, and nothing about what the change is *for*. A reviewer arriving on a
phone gets straight to `packages/common/assets/review/page.html +18 −4` with no
statement of the problem it solves or the surfaces it touches — the two things a
pull request puts above the diff precisely because nobody can review a change
they have to reconstruct first. The material exists: the spec's **Problem**, its
**Impact** table and the phase's own **goal and tasks** are all in files the
engine already reads.

**And the report ends in a row you retype.** `/spec-next` closes on
`Next: /commit, then /spec-next`, which is correct and is still a line to copy
out. Meanwhile the *page* ends in four buttons — `Commit`, `Commit & Continue`,
`Request changes`, `Discuss` — because a review is a guard in front of an
action and the ending should name the action. The terminal is the one place you
can be standing where that ending is prose.

## Decisions

1. **The header is read, never written.** The engine composes it from the spec
   files; no summary passes through the model. That is the same rule the diff
   already follows (`spec-planning.md`: "the diff never passes through the
   model"), and it is what keeps the page free however large the change.
2. **Problem, Impact, and this phase's goal and tasks — and not the rest.**
   Decisions and Changelog are the richest context and the longest; including
   them pushes the file list off the first screen, which is the thing the header
   was meant to fix. The phase index is already on the page implicitly, in the
   button that reasons from it. Rejected both deliberately rather than by
   omission.
3. **The phase shown is the one this diff is about** — the `🔄` phase, or the
   most recently `✅` one when nothing is in progress. A phase's goal beside a
   diff that predates it is worse than no goal at all.
4. **The report may end in a picker**, carrying the same four endings the page
   carries. One vocabulary for ending a review, wherever you are standing: the
   page, a pasted code, or the terminal.
5. **`Reviewed` is one of the options**, and it means "take the verdict already
   waiting" — the terminal equivalent of tapping a button on the phone that is
   still in your hand.
6. **The picker does not weaken the claim guard, and this is the one thing to
   get right.** `/spec-reviewed` is user-only by *harness enforcement*
   (`disable-model-invocation: true`), because prose alone failed to stop an
   agent claiming a pass nobody asked it to. A picker preserves the **property**
   — a person in the conversation chose, and a device that reaches the page
   cannot choose — while routing around the **mechanism**, since the model would
   run the claim downstream of the pick. So: the picker may offer `Reviewed`,
   and nothing may claim a pass without a pick. A run that shows no picker
   claims nothing, exactly as today. Write that reasoning next to the code, per
   `.claude/rules/negative-checks.md` rule 2.
7. **`Commit & Continue` stops after `/spec-next`.** Identical to the page's
   verdict of the same name — it never completes, lands or tears down. Two
   places offering one verb must not disagree about what it does.
8. **The picker blocks the turn, so it goes where the run already stops.**
   `/spec-next`'s review offer is non-blocking on purpose: `/commit &&
   /spec-next` is typed as one line, and a question that stops the run taxes
   every phase. The picker therefore appears only when there is a decision that
   was going to wait anyway — see Open questions for the case this leaves.
9. **The picker rides on `/spec-diff` too, and that is where changing your mind
   is handled.** `/spec-diff` is the "show me the review" command, so a re-render
   is exactly when someone looks again and thinks better of the verdict they
   pressed. A pass they voted is still sitting **unclaimed**, so a terminal pick
   **supersedes** it: act on the pick, drop the waiting pass, and say both
   happened. Not a second verdict alongside the first — one ending, most
   recently chosen.
10. **`/spec-reviewed` stays, with a narrower job.** The picker covers the case
   where a run just ended; it does not cover the case where one did not. Two
   reasons, and the first is mechanical: **a picker is consumed when the turn
   ends** — nobody scrolls back and picks an hour later, so a review read over
   lunch has no live control to act on. The second is the guard. `/spec-reviewed`
   is the only **harness-enforced** claim path (Decision 6 routes around that
   mechanism while keeping its property); delete the skill and no path retains
   the mechanism at all. It becomes the standalone entry point rather than the
   usual one, and that is a smaller job, not an absent one.
11. **The rule has to permit it explicitly.** `spec-reports.md` says "The block
   is the last thing in the message. Nothing follows it", which is what stops
   the block being buried in prose. A picker is a control, not prose — but a
   reader applying the rule literally would delete it as a violation, so the
   rule names the exception itself.

## Solution overview

**The header.** `collectReview` gains a `context` object — `problem`, `impact`
(the rows, already a table in the source), and `phase` (`n`, `title`, `goal`,
`tasks`). `readPhases` in `env/resolve.js` already walks the phase files and
decides which are done; this extends it to return the live phase's body rather
than only the count. The template renders it above `#files`, collapsed by
default past the first paragraph so the file list stays reachable on a phone.

A spec the engine cannot parse — a legacy bare `<name>.md`, an overview with
inline phases — yields **no header**, not an empty one. The page today works
without any of this, and a spec that cannot supply context is not a broken spec.

**The picker.** `/spec-next` ends its report and then, when a verdict is
waiting or a commit is the obvious next step, offers:

| Option | Does |
|--------|------|
| `Reviewed` | Claims the waiting pass and routes on its verdict |
| `Commit` | Runs the project's commit skill, and stops |
| `Commit & Continue` | Commits, then `/spec-next` — and stops there |
| `Discuss` | Asks what is up; changes nothing |

`Reviewed` appears **only when a pass is actually waiting** — the render already
knows, and offering a pickup with nothing to pick up is the empty gesture this
spec is against.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Engine | update | `collectReview` — `context` in page data |
| Engine | update | `readPhases` — return the live phase's goal and tasks |
| Page | add | context header above `#files`, collapsible |
| Skill/rule | update | `spec-next` — the report may end in a picker |
| Skill/rule | update | `spec-diff` — the same picker, and a pick supersedes a waiting pass |
| Skill/rule | update | `spec-reviewed` — narrowed to the standalone entry point |
| Skill/rule | update | `spec-reports.md` — a picker is a permitted ending |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The page opens with why | ⬜ | [01-page-opens-with-why.md](01-page-opens-with-why.md) |
| 2 | The report ends in a choice | ⬜ | [02-report-ends-in-a-choice.md](02-report-ends-in-a-choice.md) |

## Non-goals

- **A written summary.** Decision 1. The header is composed from files, and the
  moment it is generated it stops being free and starts being stale.
- **A picker on every skill.** Decision 8. Each one costs a blocked turn, and a
  workflow that stops to ask after every command is worse than one that does not
  ask at all.
- **Deleting `/spec-reviewed`.** Decision 10. The picker makes it less often
  needed, which is not the same as unneeded.
- **A second verdict living beside the first.** Decision 9. A pick supersedes;
  it does not accumulate. Two standing verdicts is the state this whole design
  has avoided since `feat-review-verdict`.
- **Gating anything on the picker.** The marks on the page gate nothing
  (`feat-review-verdict` Decision 1) and neither does this: a run where nobody
  picks is a run that ends, not one that waits.

## Open questions

- [ ] **Does the picker fire when no pass is waiting?** Decision 8 puts it where
      the run already stops, and `/spec-next`'s review offer deliberately does
      not. So a phase built with nothing waiting may end with no picker at all —
      correct by Decision 8, and possibly the common case. Phase 2 decides
      whether `Commit` / `Commit & Continue` alone are worth stopping for, or
      whether the picker is strictly the "a pass is waiting" ending.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-14 — Picker extended to `/spec-diff`, where changing your mind is the
  natural case, with a pick **superseding** an unclaimed pass. Deleting
  `/spec-reviewed` was considered and rejected: a picker is consumed when the
  turn ends, so a review read an hour ago has no live control left, and the
  skill is the only harness-enforced claim path. Decisions 9 and 10.
- 2026-09-14 — Spec created.
