---
linear_issue_id: "SKS-274"
---

# Phase 1 — The `Continue` verdict and the button set ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine accepts a `continue` verdict that resumes the run without
committing, and a render can declare which button set its page shows — proven by
tests that a `continue` can never clear an armed gate.

## Tasks

- [x] Add `continue` to `VERDICTS` in `packages/common/src/env/review.js`; leave
      `COMMITTING` as `['commit', 'commit-continue']` so a `continue` is
      structurally incapable of clearing a gate.
- [x] Add the render flag declaring the button set (committing vs mid-run).
      Default it to the committing set, so an existing caller that says nothing
      keeps today's page.
- [x] Render `Continue` in place of the committing buttons when the mid-run set
      is asked for, and keep `Request changes` / `Discuss` in both.
- [x] Test: a `continue` pass is stored, claimed and replayed like any other.
- [x] Test: a `continue` pressed against an **armed** gate leaves it armed —
      the one assertion that keeps decision 2 from eroding.
- [x] Test (stays-silent, `.claude/rules/negative-checks.md`): a render with no
      flag is byte-identical to today's page, so adopting this changes nothing
      for a caller that has not opted in.
- [x] Test: the button set follows the flag and **not** the gate, including in a
      `review.required: false` project — the rejected alternative in decision 4.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`DEFAULT_VERDICT` stays `discuss`. A pass that names no verdict must keep
meaning *stop and talk*, never *carry on*: the one that carries on has to be
chosen.
