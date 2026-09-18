---
linear_issue_id: "SKS-346"
---

# Phase 1 — Report the action a claim took ✅

> **Status:** Done

**Goal.** A claimed pass says which action it carried, so `/spec-diff` §2b can
route on it. This is the load-bearing half: without it the other two phases fix
a button that still does nothing.

## Tasks

- [x] `specEnvReview`'s claim branch reads `parsed.action` alongside
      `parsed.verdict` and puts it on `claimed` (`packages/common/src/cli.js`,
      the `if (claimCode)` block).
- [x] The text report names it — the `claimed:` line carries the action where a
      pass had one, and is unchanged where it did not.
- [x] `--json` carries `claimed.action`, `null` when the pass had none. The
      skill routes on the JSON, so text alone would leave §2b unreachable.
- [x] Sync into the shipping packages — `npm run build`, which regenerates
      `packages/skitterspec` and `packages/skitterspec-linear` from `common`.
      They are generated, not hand-edited.
- [x] Tests green: `packages/common/test/env-review-claim-action.test.js` —
      the two defect tests, plus the two stays-silent ones asserting an action
      neither fills the verdict slot nor discharges the gate.
- [x] Full suite + build green — 3358 pass, 0 fail.

## Notes

**`claimed.action` is `null`, never absent.** Every other optional key on the
`--json` payload is spread conditionally so a caller sees no new key — but
`claimed` is itself conditional, so a consumer reading it is a consumer written
after this shipped. A present `null` is what lets the skill distinguish "no
action" from "an engine too old to say".

**It must not touch `sentVerdict`.** `ACTIONS` is disjoint from `VERDICTS` by
construction, and the gate reads the verdict. Reporting the action is a new
field beside that, not a widening of it.
