---
linear_issue_id: "SKS-268"
---

# Phase 5 — The endings people actually see ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the two places a reader is asked for a verdict — the terminal report
and the page — say so unmissably and stay honest afterwards, proven by guards
on the report contract and tests on the page's decided state.

## Tasks

- [x] **The review call-to-action moves out of the table, after it**, as a
      designed banner rather than a row: a rule, a heading naming the state,
      the counts, the link, and one line saying the run is holding. Amend
      `.claude/rules/spec-reports.md` to name it as the second permitted thing
      after the block (the picker was the first), and keep the ban on prose
      absolutely — an exception that is a *rendered control* is not the failure
      the ban exists against
- [x] Update `/spec-next` §5 and §6a, and re-aim the guards in
      `assets-offer-last.test.js` that currently pin the offer as a table row —
      the invariant is that it is findable and addressed to someone, and this
      strengthens it rather than loosening it
- [x] **A sent pass ends the page**: on a delivered verdict the diff fades out
      and a panel states what was chosen and that it was handed over. Only on
      real delivery (POST or store) — a clipboard copy is not yet delivered and
      must keep saying so
- [x] **The decision sticks.** Re-opening the same render shows the same panel,
      persisted the way the marks already are. Keyed to the render, so the next
      render after a commit is a live page again
- [x] **A way back in, with the buttons dead.** The panel offers to show the
      diff again; the verdict buttons stay disabled, saying what was chosen and
      why they are disabled — the agent is probably no longer listening
- [x] Restyle the `WHY` / context block: it is blocky, tight and oversized —
      give the prose a readable measure and line-height, soften the panel, and
      make the `More` disclosure read as a control rather than a full-width box
- [x] Tests: the decided state on each transport (delivered vs copied), that it
      survives a reload, that a new render clears it, that buttons are disabled
      with a reason, plus the report-contract guards. `pnpm test` green

## Notes

**The banner is not the old failure returning.** The offer was once two quoted
lines at the tail of a long report, addressed to nobody, under a closing line
that told the reader to move on — and it was never once taken. What replaced it
was a labelled row, which was findable. What this adds is that the run now
*waits*: the reader is not being offered something optional, they are being told
the work is stopped until they answer. That is a different message and it earns
a different shape — the loudest thing on screen, at the end, where the eye
finishes.

**Two things the build turned up.** The decided panel first hid the
`/spec-reviewed <code>` hand-off along with the rest of the send controls —
which is exactly wrong on a served page, where that command is how the pass gets
picked up. It is now carried *by* the panel, and restored on a re-open, since
the tab holding it is often not the tab you come back in. And `LABELS` only ever
named the two committing verdicts, so a decided `changes` or `discuss` rendered
as a raw keyword; it now names all four, in one place.
