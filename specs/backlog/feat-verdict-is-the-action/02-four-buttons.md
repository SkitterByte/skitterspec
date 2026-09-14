---
linear_issue_id: "SKS-235"
---

# Phase 2 — The page's four buttons ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the page offers the four things a review can conclude, each labelled
with what it will do, and both committing buttons are blocked together while a
note is open.

## Tasks

- [ ] Four buttons: **`✓ Commit`**, **`✓ Commit & Continue`**,
      **`↺ Request changes`**, **`… Discuss first`** — each carrying its own
      verdict and copying or posting the pass, one action per decision.
- [ ] Block **both** committing buttons while a note is open, with the reason on
      each label ("1 open note"), and re-enable them together as notes go. One
      `openNotes()` count, two buttons — never two counts that can disagree.
- [ ] Say on the continue button what it will not do: it builds the **next
      phase** and stops. A reader must not press it expecting the spec to be
      finished and landed.
- [ ] Keep the bar **after the diff** (`feat-review-verdict`) and the send path
      unchanged (`feat-review-post-back`): a fourth button changes what is sent,
      not how.
- [ ] Keep the layout honest on a phone — four controls wrap rather than
      shrinking to unreadable, and the two committing ones stay adjacent so the
      pair reads as a pair.
- [ ] Tests, driving the real page as `assets-review.test.js` establishes: each
      of the four emits its own verdict and passes the **real** validator; both
      committing buttons disable together on an open note and enable together
      when it goes; unaccepted files disable none of them.
- [ ] **Stays silent:** `file://` still copies, a served page still posts, and
      the marks still stay put after sending.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The pairing is the detail to get right. Two buttons that commit must be blocked
by the same count and re-enabled by the same event; a page where `Commit` is
disabled and `Commit & Continue` is not would be a way to commit past the one
refusal this page makes.
