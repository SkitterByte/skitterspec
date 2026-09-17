---
linear_issue_id: "SKS-323"
---

# Phase 3 — The banner and the amended rule ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the waiting banner carries the same labelled stack, and
`.claude/rules/spec-reports.md` defines that shape once — with the reason the
one-link rule changed recorded beside it.

## Tasks

- [x] Amend the **Exactly one link, never two** section to
      **one link per reachable store, each labelled**, keeping its evidence: two
      links failed because the wait stood behind only one door, and three
      verdicts were pressed on a published page while each sat unread.
- [x] **Record why that objection no longer covers local and network**: the page
      POSTs to `location.pathname`, so both reach the same server and the same
      pending store — one room, two doors. `remote` remains a second store and
      keeps the caveat it always had.
- [x] Define the banner's stack in that rule, so every skill emits the same
      shape rather than improvising one: the tiers in fixed order, the one line
      saying which the wait covers, and no prose.
- [x] Update the skills that emit the banner to point at the rule rather than
      carry their own copy of the shape — `/spec-next`, `/spec`, `/spec-review`,
      `/spec-bug`, `/spec-hotfix`.
- [x] Tests: the rule names all three tiers and the shared-store reason; every
      skill that renders a page references the rule's stack and does not inline
      a competing one; the old absolute wording is gone.
- [x] **Stays-silent test** (rule 3): the *substance* of the original rule
      survives — a test asserting the rule still forbids offering two links into
      **different** stores without saying which the wait watches. Amending it
      must not read as deleting it.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

This phase is the one that could go wrong quietly. The one-link rule was written
after a real failure, and a spec that overturns it while feeling clever is how
that failure returns. The amendment has to carry the original evidence and be
narrower than "more links are fine" — which is why the stays-silent test asserts
what is still forbidden rather than only what is now allowed.

Doing it last is deliberate: the rule should describe a shape that already
exists and has been used, not one that is still being designed.

Doing it last was the right call twice over. The stack existed and had been
read, so the rule describes a shape rather than proposing one — and the sweep it
implied turned out to be wider than the task list named: the engine stopped
printing `open:` in phase 2, so every skill still telling its reader to relay
that line was naming output that no longer exists. `/spec-diff` was carrying
two of those plus the pre-rename `review.serveOnRemote`, so it is amended here
alongside the five the tasks name.

The reader-detection branch went with it. Three reader states used to pick three
different links; the stack lists every tier whatever detection says, so the
branch in `/spec-next`, `/spec-bug`, `/spec-hotfix` and `/spec-diff` had nothing
left to decide. That is decision 6 arriving one layer up from where it was
written — the engine's `detectReader` is untouched and still reports on the
`reader:` line.
