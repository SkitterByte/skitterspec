---
github_issue_id: "#233"
---

# Phase 3 — Skills relay the offer; docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a person hitting the gap from any skill gets the refusal, then a
two-option picker, then the retry — proven by asset tests on the skill text and
a refreshed `reference` page.

## Tasks

- [x] `offered-unblocks.md`: add the base-gap offer as the worked `satisfy`
      example (label, command, retry).
- [x] `/spec-start`, `/spec-to-main`, `/spec-complete`, `/spec-diff`,
      `/no-spec`, `/spec-idea`: one line each pointing at `offered-unblocks.md`
      for a base refusal that carries an offer — relay, offer, retry on pick.
- [x] Update the rolling-base passage in `env.config.md` ("a refusal, never a
      fall-through") to describe the gap, the offer and the self-clearing pin.
- [x] `docs/reference.html`: document `baseBranchFallback`, the pin and the new
      `spec-env base` flags; bump its `verified:`.
- [x] Extend `assets-rolling-base.test.js` to assert the skills and rule carry
      the offer wording; run `node scripts/docs-freshness.js check`.
- [x] Run `pnpm test` — green before the phase is done.
