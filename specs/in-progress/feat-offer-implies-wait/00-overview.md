---
linear_identifier: "SKS-272"
linear_url: "https://linear.app/skitterbyte/issue/SKS-272/offering-a-review-means-waiting-for-it"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Offering a review means waiting for it

> **Type:** Feature
> **Name:** feat-offer-implies-wait (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-15)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** `packages/common/src/env/review.js`, `packages/common/assets/rules/spec-reports.md`, `assets/skills/{spec-bug,spec-hotfix,spec-next,spec-diff}/SKILL.md`
> **Stack:** worktree

## Problem

Only `/spec-next` waits for a review verdict. `/spec-bug` and `/spec-hotfix`
render the page and emit a `Review` row asking
*"want a written review before you commit?"* — and then finish. Nothing is
watching. A verdict pressed on that page lands in `.pending.json` and stays
there until someone types `/spec-reviewed`, which they have no reason to do,
because the run told them the page was ready rather than that it was waiting.

This is not a slip in those two skills. `spec-reports.md` and `/spec-next` both
**sanction** the non-waiting row explicitly ("Where the run is not waiting, it
stays a `Review` row"), so the row is doing exactly what the contract says.

Observed on `bug-review-gate-hook-install`: two verdicts pressed, both `commit`,
both stranded. The second existed only because the first appeared to do nothing.
An offer that cannot be answered teaches the reader the button is decorative —
which costs more than never having offered.

## Decisions

1. **An offer implies a wait.** Any render that asks the reader for a verdict
   ends the turn watching for one. Where a run does not intend to wait, it does
   not ask: the `Review` row keeps the counts and the link and
   **loses the question**. Rejected: keeping a non-waiting question with a
   caveat explaining it will not be seen — that is the shape that stranded the
   two passes, and a truthful caveat does not make an unanswerable question
   worth asking.

2. **Waiting and arming are separate.** *Waiting* is what any offer does.
   *Arming* asserts an obligation that outlives the turn, and belongs only to
   work that is finished. So `/spec-bug` and `/spec-hotfix` now
   **arm as well as wait** — their fix is a completed unit, and a wait with
   nothing owed behind it is a suggestion. A mid-phase render waits without
   arming, and walking away from it costs nothing.

3. **Mid-run renders get a `Continue` verdict.** "Commit" is the wrong verb for
   unfinished work, so a page rendered mid-run offers `Continue` —
   *I have read it, carry on* — alongside `Request changes` and `Discuss`. This
   is not the
   `none` verdict that was removed: `none` recorded itself and did nothing, while
   `Continue` resumes the run, so it still names an action.

4. **The button set is declared by the caller, not derived from the gate.**
   Rejected: deriving it from whether the gate is armed — elegant, and wrong for
   any project running `review.required: false`, which never arms and would
   therefore never be offered a committing verdict at all.

5. **A page that cannot be served still waits; the paste is the pass.** A
   `file://` page has no server to POST to, so the wait is carried by the
   conversation rather than a file-watch: the run ends its turn and says so. The
   existing ban on *promising a file-watch the transport cannot deliver* stands —
   what changes is that ending the turn is itself a real wait.

6. **Where the harness cannot watch a file, the wait is the turn ending.**
   Same mechanism as decision 5. The current "change nothing"
   escape hatch is what let a whole class of runs keep asking unanswerable
   questions.

## Solution overview

`continue` joins `VERDICTS` in `packages/common/src/env/review.js` and stays out
of `COMMITTING`, so it can never clear an armed gate. `spec-env review` takes a
flag declaring which button set the page renders — the committing set for
finished work, the `Continue` set for mid-run — and the page renders accordingly.

`spec-reports.md` stops describing two situations (waiting / not waiting) and
starts describing two shapes with one rule between them:

- **Asking** → the `⏸ Review ready` banner after the block, and the run waits.
- **Not asking** → the `Review` row inside the block: counts and link, no
  question.

`/spec-bug` and `/spec-hotfix` adopt `/spec-next`'s arm-render-wait sequence
verbatim rather than growing their own. `/spec-diff` waits with the `Continue`
set when the work is unfinished.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | add | `continue` in `VERDICTS`; excluded from `COMMITTING` |
| CLI command | update | `spec-env review` gains the button-set flag |
| Review page | update | renders `Continue` in place of the committing buttons when asked to |
| Skill/rule | update | `spec-reports.md` — `Review` row loses its question; banner rule restated as offer⇒wait |
| Skill/rule | update | `/spec-bug`, `/spec-hotfix` — arm + wait; `/spec-next`, `/spec-diff` — non-asking row, `Continue` path |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The `Continue` verdict and the button set | ✅ | [01-continue-verdict.md](01-continue-verdict.md) |
| 2 | The report contract: offer implies wait | ⬜ | [02-report-contract.md](02-report-contract.md) |
| 3 | The skills that offer | ⬜ | [03-skills-wait.md](03-skills-wait.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | Ready | backlog | Reuben Greaves |
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-15 — Spec created, from two verdicts stranded on
  `bug-review-gate-hook-install`.
- 2026-09-15 — Phase 1: the render flag is `--buttons <committing|midrun>`, and
  `committing` named explicitly adds no payload key — so asking for the default
  is byte-identical to not asking, and only opting in ever shows. The `--json`
  report follows the same absent-stays-absent rule.
- 2026-09-15 — Phase 1: `continue` is not blocked by an open note. The engine's
  single refusal is about COMMITTING verdicts, and a disabled button for a
  refusal the engine does not make would be the page holding a second opinion.
- 2026-09-15 — Follow-up surfaced while linking this spec: `spec-sync apply`
  hit a Linear 503 part-way, printed "re-run to resume without duplicating",
  and the re-run duplicated — SKS-273 and SKS-274 are the same phase 1. The
  parent was stamped and skipped correctly, so only the sub-issue leg is
  missing the already-created check. Not in scope here.
