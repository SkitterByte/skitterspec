---
linear_issue_id: "SKS-303"
---

# Phase 3 — `/spec-review` hands its refresh back the same way ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-review` ends on the same page with `Commit`, `Request changes`
and `Discuss` — no start verdict — so a refreshed spec is read before it is
committed.

## Tasks

- [ ] End `/spec-review` by rendering `spec-env review <spec> --docs` and waiting,
      the same way phase 2 does.
- [ ] Offer `commit`, `changes` and `discuss` only. **No `commit-start`:** the
      spec it refreshed may already be in progress, so a start verdict would be
      wrong for half its inputs.
- [ ] Show the refresh as a **patch**, not as new files — these documents are
      tracked, so the diff against `HEAD` is what the reader wants: what drifted
      and what was rewritten.
- [ ] Arm nothing here either, and assert it.
- [ ] Tests: the page carries three verdicts and not `commit-start`; a tracked
      spec renders as a patch rather than as whole new files; the skill waits.
- [ ] **Stays-silent test** (rule 3): a `/spec-review` that found no drift and
      changed nothing renders no page and waits for nothing — there is no pass to
      ask for when there is no change to read.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The no-drift case is the one worth getting right: `/spec-review` frequently
concludes that a spec is still accurate, and a page showing an empty diff with a
commit button on it would be asking for a verdict on nothing.
