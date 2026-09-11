---
linear_issue_id: "SKS-171"
---

# Phase 4 — Changes, discuss, and the docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** all three verdicts route, the old wait rule is amended rather than
contradicted, and every surface adopters read describes the decision the page now
ends in.

## Tasks

- [ ] Route `changes`: it **is** the go-ahead, so work the commented files
      immediately, exactly as the current post-confirmation path does.
- [ ] Route `discuss`: report the notes and stop — and make plain this is what a
      blob with **no** verdict does too, so the old behaviour is the default rather
      than an exception.
- [ ] **Amend the wait rule, don't delete it.** It becomes "wait unless the
      verdict says otherwise", and the reasoning stays: a bare paste is genuinely
      ambiguous, a verdict is not. Update the guard test in
      `assets-spec-diff.test.js` to pin the amended rule — including that no
      verdict still waits.
- [ ] Re-check the **no-gate** guards still pass untouched. They must: this spec
      adds a chosen verdict, never a count (Decision 1). If one needs weakening,
      stop — that means the design drifted.
- [ ] Update `spec-planning.md`, the CLAUDE.md section, this repo's own CLAUDE.md
      and the docs site so the round-trip ends in a decision. The docs site's
      pipeline already has a HAND BACK stage — it gains the verdict.
- [ ] Keep the `/spec-diff` description inside the 500-char budget; add a trigger
      only if "approve"/"request changes" phrasing genuinely needs to route.
- [ ] Tests: each verdict routes as documented; the amended wait rule is pinned;
      the docs-claims guard covers `review.commitWith`.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The interesting test here is the one that
**fails if the no-gate rule had to be weakened**. If shipping a verdict
required loosening a guard written to keep
counting out, the verdict would have become a count somewhere along the way.
