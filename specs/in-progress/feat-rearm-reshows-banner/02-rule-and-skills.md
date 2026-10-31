---
github_issue_id: "#84"
---

# Phase 2 — Rule and skills relay the re-show; silence between ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Every waiter relays a `re-show:` as the verdict line plus the
banner, and ends a plain re-arm with no text. This is proven by asset tests
that pin the wording.

## Tasks

- [x] Update the re-arm section of `packages/common/assets/rules/spec-reports.md`:
      replace "say nothing" with strict wording (the tool call is the whole
      turn), add the periodic re-show (verdict line, if still in context, plus
      the banner in its current state, with the stack copied from the
      engine's `re-show:` lines), and state that this repeats an existing
      control, not a third one.
- [x] Update the shared re-arm sentence in the spec, spec-next, spec-bug,
      no-spec `SKILL.md` (spec-diff carries no re-arm sentence, so it is untouched) to point at the rule. Don't restate it:
      one copy, as `assets-wait-rearm.test.js` enforces.
- [x] Update `docs/review.html` (the waiting paragraph) and
      `docs/reference.html` (the `review wait` flags), and bump each page's
      `verified:`.
- [x] Extend `packages/common/test/assets-wait-rearm.test.js`: the rule names
      the 5-re-arm re-show and text-free re-arms, every waiter points at it,
      none restates the cadence, and a `doesNotMatch` on any wording that
      allows a status line per re-arm.
- [x] Run `pnpm test` and
      `node scripts/docs-freshness.js check`, and get them green.
