---
github_identifier: "#293"
github_url: "https://github.com/SkitterByte/skitterspec/issues/293"
---

# Progress through the spec, at the top of the review page

> **Type:** Feature
> **Name:** feat-review-progress
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/293
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** `packages/common/assets/review/page.html`, `docs/review.html`
> **Stack:** worktree
> **Docs:** review

## Summary

The review page shows how far through the spec the work is, under its title:
which phase this is out of how many, how many of that phase's tasks are
ticked, and a thin bar for the phases done.

## Problem

A review page says what changed but not where the work stands. A reader on
their phone can't tell whether this is phase 1 of 4 or the last one, or how
much of the phase is finished, without opening the spec. The page already
receives that data (`data.phases`: `total`, `done`, and the live phase with its
tasks) and only uses it to dim a button.

## Acceptance criteria

- A page for a phase in progress shows "Phase 2 of 3 · 5/7 tasks" under the
  title, with a bar filled to the phases done.
- A page for a finished spec reads "3 of 3 phases done", with the bar full.
- A newly written spec's page (no phase started) reads "3 phases · none
  started", with the bar empty.
- A spec with no phase files (a legacy layout, a single-pass bug, an epic) shows
  no progress line, and the page looks as it does today.
- The line and bar read correctly in light and dark themes and at phone width.

## Decisions

1. **Phases and the live phase's tasks.** The live phase is the phase the page
   is about. Rejected: counting all tasks across the spec, which needs the
   engine to read every phase file and hides which phase the page covers.
2. **A line plus a thin bar, under the title.** It can be read at a glance on a
   phone. Rejected: text only on the branch line, which already carries five
   items.
3. **Page-only.** The engine already sends `data.phases`, so nothing in the
   engine or its JSON changes.
4. **No phases means no line.** `data.phases` is `null` for a legacy or
   single-pass spec, and an epic has `total: 0`. Both draw nothing rather than
   "0 of 0".

## Solution overview

In the header script, after the ticket and product chips: when
`data.phases && data.phases.total > 0`, build a `.progress` block with the
text and a bar. The bar is a track plus a fill whose width is
`done / total`, coloured from the existing theme tokens.

- live phase in progress → `Phase {n} of {total} · {ticked}/{tasks} tasks`.
  A phase with no tasks drops the task half.
- `done === total` → `{total} of {total} phases done`.
- no live phase and `done === 0` → `{total} phases · none started`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Route/UI | update | review page header: progress line and bar |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Progress line and bar on the review page | ✅ | [01-progress-line.md](01-progress-line.md) |

## Open questions

- None

## Changelog

- 2026-11-24 — Spec created. Requested from a review page in LSC App.
- 2026-11-24 — Phase 1 built. The bar is a `role="progressbar"` with
  `aria-valuenow`, so it is read out too. A phase with no tasks drops the task
  half ("Phase 1 of 2").
- 2026-11-24 — Completed; all phases done, tests green.
