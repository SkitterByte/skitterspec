---
linear_issue_id: "SKS-275"
---

# Phase 2 — The report contract: offer implies wait ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-reports.md` defines one rule — asking implies waiting — and the
two shapes that follow from it, so no skill can legitimately emit an
unanswerable question.

## Tasks

- [ ] Rewrite the `Review` entry in the field vocabulary: the row carries counts
      and the link and **no question**. Keep it one row.
- [ ] Replace the "Where the run is not waiting, it stays a `Review` row"
      paragraph with the rule in decision 1, and say what it is guarding against
      — a reader taught that the button is decorative.
- [ ] Restate "Only promise a wait the transport can deliver" per decisions 5–6:
      the wait is real in every case; what varies is whether a file-watch or the
      reader's next message carries it. Keep the published-page wording, which is
      the one case where nothing pushes back at all.
- [ ] Document the `Continue` ending alongside the committing ones, including
      why it is not the removed `none`.
- [ ] Extend `packages/common/test/assets-report-contract.test.js` (and
      `assets-offer-last.test.js` where it asserts the row) so a skill emitting a
      question in a `Review` row fails.
- [ ] Test (stays-silent): a skill emitting the banner **and** waiting still
      passes, and a `Review` row with no question still passes — the rule must
      catch the unanswerable question, not every mention of a review.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`.claude/rules/` is symlinked from `assets/` in this repo, so editing the asset
updates the rule this session is reading. Expect the change to apply to the run
that makes it.
