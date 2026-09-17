---
linear_issue_id: "SKS-323"
---

# Phase 3 — The banner and the amended rule ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the waiting banner carries the same labelled stack, and
`.claude/rules/spec-reports.md` defines that shape once — with the reason the
one-link rule changed recorded beside it.

## Tasks

- [ ] Amend the **Exactly one link, never two** section to
      **one link per reachable store, each labelled**, keeping its evidence: two
      links failed because the wait stood behind only one door, and three
      verdicts were pressed on a published page while each sat unread.
- [ ] **Record why that objection no longer covers local and network**: the page
      POSTs to `location.pathname`, so both reach the same server and the same
      pending store — one room, two doors. `remote` remains a second store and
      keeps the caveat it always had.
- [ ] Define the banner's stack in that rule, so every skill emits the same
      shape rather than improvising one: the tiers in fixed order, the one line
      saying which the wait covers, and no prose.
- [ ] Update the skills that emit the banner to point at the rule rather than
      carry their own copy of the shape — `/spec-next`, `/spec`, `/spec-review`,
      `/spec-bug`, `/spec-hotfix`.
- [ ] Tests: the rule names all three tiers and the shared-store reason; every
      skill that renders a page references the rule's stack and does not inline
      a competing one; the old absolute wording is gone.
- [ ] **Stays-silent test** (rule 3): the *substance* of the original rule
      survives — a test asserting the rule still forbids offering two links into
      **different** stores without saying which the wait watches. Amending it
      must not read as deleting it.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This phase is the one that could go wrong quietly. The one-link rule was written
after a real failure, and a spec that overturns it while feeling clever is how
that failure returns. The amendment has to carry the original evidence and be
narrower than "more links are fine" — which is why the stays-silent test asserts
what is still forbidden rather than only what is now allowed.

Doing it last is deliberate: the rule should describe a shape that already
exists and has been used, not one that is still being designed.
