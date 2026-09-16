---
linear_issue_id: "SKS-306"
---

# Phase 2 — Teardown says what it is about to strand ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-complete` and `/spec-cancel` name a pass still waiting for the
spec they are finishing, before the teardown they already confirm — so the last
moment a verdict can be honoured is not passed silently.

## Tasks

- [ ] In both skills, read `spec-env review waiting --json` before the teardown
      confirmation and filter to the spec being finished. Another spec's pass is
      not this run's business (`.claude/rules/spec-reports.md`: it reports this
      run and nothing else).
- [ ] Report spec, code, verdict and age, then the two exits: claim it now with
      `/spec-reviewed <code>` while the worktree still stands, or disown it with
      `spec-env review <spec> --drop <code>`.
- [ ] **Report, never block.** No refusal, no extra confirmation of its own, and
      no non-zero exit — the teardown confirmation already asks the operator, and
      a waiting pass is information rather than a gate.
- [ ] **It never claims.** Reporting a pass is not taking one; `/spec-diff` §0 is
      untouched.
- [ ] Say *why* it matters at this moment: before teardown a `commit` verdict can
      still be claimed and acted on, after it the pass can only be disowned.
- [ ] Put it in the report's `Notes` row — what this run hit and handled — not in
      a row of its own invention.
- [ ] Tests: a spec with a waiting pass gets the line and the two exits; the line
      names no other spec's pass when one is waiting elsewhere; neither skill
      contains a claim in that block, anchored to the waiting block rather than
      matching `/never claim/` anywhere in the file.
- [ ] **Stays-silent test** (rule 3): a spec with no waiting pass produces the
      skill's current output exactly, with no mention of reviews.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Only these two skills. The landed `feat-no-pass-waits-unheard` put the
entry-point report in `/spec-next` and `/spec-start` and left the others out
deliberately — a rule nobody needs teaches people to skim. These two earn it for
a different reason: they are the ones that destroy the worktree.

The anchored claims-nothing test is the shape that spec had to fix once already:
`/never claim/` matched prose elsewhere in the file and stayed green against a
mutation that weakened the rule.
