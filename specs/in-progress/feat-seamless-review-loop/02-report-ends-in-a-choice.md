---
linear_issue_id: "SKS-247"
---

# Phase 2 — The report ends in a choice ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-next` can end in the same four endings the page carries, so the
terminal is a third way to finish a review rather than a row you retype.

## Tasks

- [x] Amend `spec-reports.md`: a picker is a **permitted ending** after the
      block. Say why the rule reads as it does — "nothing follows it" exists so
      the block is not buried in prose, and a control is not prose — or the next
      reader deletes the picker as a violation (Decision 9).
- [x] Amend `spec-next`'s `## Report`: when a pass is waiting, end in a picker
      carrying `Reviewed` · `Commit` · `Commit & Continue` · `Discuss`. Name
      what each does, and that `Commit & Continue` **stops after `/spec-next`**
      (Decision 7) — do not restate the routing, point at `/spec-diff` §2 as
      `/spec-reviewed` already does.
- [x] **`Reviewed` only when a pass is actually waiting.** The render already
      reports `pending:`; offering a pickup with nothing to pick up is the empty
      gesture this spec exists against.
- [x] Write Decision 6's reasoning **beside the instruction**, per
      `negative-checks.md` rule 2: the picker keeps the property (a person in
      the conversation chose) while routing around the mechanism
      (`disable-model-invocation`). Name what would fool it, and state plainly
      that nothing may claim a pass without a pick.
- [x] **Offer the same picker from `/spec-diff`** (Decision 9). It renders the
      page, so it is where someone looks again — and where they think better of
      the verdict they pressed.
- [x] **A terminal pick supersedes an unclaimed pass**, never joins it: act on
      the pick, drop the waiting pass, and report both. Two standing verdicts is
      the state this design has avoided since `feat-review-verdict`.
- [x] **Narrow `/spec-reviewed` rather than deleting it** (Decision 10). Say in
      its body what it is now *for* — the run that already ended, the review read
      an hour ago, the fresh session — and why the picker does not replace it: a
      picker is consumed when the turn ends, and this is the only claim path the
      harness itself enforces.
- [x] **Add a `Snags` field to the report vocabulary** in `spec-reports.md`: one
      short paragraph for the issues this run hit and handled. It goes after
      `Tests` and before `Review`, and it is what the "nothing follows the
      block" rule has been losing — the content is worth keeping, it just had
      nowhere inside the block to live, so it kept ending up after it.
- [x] **Tighten the rule while adding the row.** "Nothing follows the block" is
      already stated and was already broken repeatedly, which makes it a missing
      *destination* rather than a missing prohibition. Say plainly: if it is
      worth telling the reader, it is a row; if it is not a row, it is not worth
      telling them.
- [x] **Answer the Open question** before building: does the picker fire when no
      pass is waiting? Decide, record it in the Changelog, and build that.
- [x] Tests pinning the prose as `assets-spec-reviewed.test.js` and
      `assets-report-contract.test.js` establish: the four options and their
      effects, `Reviewed` conditional on a waiting pass, the claim-guard
      reasoning present, `spec-reports.md` permitting the ending, the supersede
      rule stated in both skills that offer the picker, and `/spec-reviewed`
      still carrying `disable-model-invocation: true` with its narrowed purpose
      written down.
- [x] **Stays silent:** a run with nothing waiting behaves exactly as it does
      today — block last, `Next` row intact, nothing claimed.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

The chaining cost is real and is the reason Decision 8 exists: `/commit &&
/spec-next` is typed as one line, and a picker in the middle of it stops the
run. That is acceptable where a decision was going to wait anyway, and a tax
everywhere else.
