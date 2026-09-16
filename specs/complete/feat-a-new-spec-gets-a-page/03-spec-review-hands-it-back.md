---
linear_issue_id: "SKS-303"
---

# Phase 3 — `/spec-review` hands its refresh back the same way ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-review` ends on the same page with `Commit`, `Request changes`
and `Discuss` — no start verdict — so a refreshed spec is read before it is
committed.

## Tasks

- [x] End `/spec-review` by rendering `spec-env review <spec> --docs` and waiting,
      the same way phase 2 does.
- [x] Offer `commit`, `changes` and `discuss` only. **No `commit-start`:** the
      spec it refreshed may already be in progress, so a start verdict would be
      wrong for half its inputs.
- [x] Show the refresh as a **patch**, not as new files — these documents are
      tracked, so the diff against `HEAD` is what the reader wants: what drifted
      and what was rewritten.
- [x] Arm nothing here either, and assert it.
- [x] Tests: the page carries three verdicts and not `commit-start`; a tracked
      spec renders as a patch rather than as whole new files; the skill waits.
- [x] **Stays-silent test** (rule 3): a `/spec-review` that found no drift and
      changed nothing renders no page and waits for nothing — there is no pass to
      ask for when there is no change to read.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The no-drift case is the one worth getting right: `/spec-review` frequently
concludes that a spec is still accurate, and a page showing an empty diff with a
commit button on it would be asking for a verdict on nothing. Phase 1's
`nothing to review` refusal already covers it, so the skill takes that refusal as
the answer rather than checking for drift a second time.

**A fourth button set, not a reuse.** `refresh` is `commit`, `changes`,
`discuss`. The plan said "the same page with no start verdict", which needed its
own set — `authoring` carries `commit-start`, and offering it here would offer to
provision a worktree for a spec that already has one.

**An existing cross-skill guard caught the gap.** `assets-phase-end-review`
scans every shipped skill for the render command and requires each one to carry
the waiting banner or be exempt with a stated reason. `/spec-review` described
the banner in prose without showing it, and the scan flagged it — so the skill
now carries the shape it is meant to emit. That guard was written for three
phase-end skills and fired correctly on a fourth it had never seen, which is
worth more than the fix.
