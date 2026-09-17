---
linear_issue_id: "SKS-327"
---

# Phase 3 — The skills route it, the rule holds the shape ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-diff` owns the action's routing, every skill that waits picks it
up for free, and `.claude/rules/spec-reports.md` carries the banner's `live:`
line with the reason it was amended in.

## Tasks

- [x] Add the action to `/spec-diff` §2's routing, beside the verdicts, as the
      one ending that **loops back**: `live-on` → hand off to
      `review.commitWith` with the render's pathspec, then `live take`, then
      re-render `--branch` and **wait again**; `live-off` → `live release`, then
      re-render and wait again.
- [x] State plainly there that the gate is **untouched** by either — the commit
      is a precondition and the action is not a verdict, so a phase that ended
      still owes one (decisions 2 and 3).
- [x] Stop on a refusal: relay the engine's reason, re-render, and wait again.
      Never park another spec's hold, never `--force` anything.
- [x] Amend `spec-reports.md`'s banner to carry one `live:` line, with the
      reason recorded beside the tier-stack amendment: a reader deciding whether
      to open the page wants to know whether it is already running.
- [x] Point `/spec-next`, `/spec-bug` and `/spec-hotfix` at that rule rather
      than giving each its own copy of the line — the lesson from the tier
      stack, where six skills had each grown their own version.
- [x] Tests: the rule names the line and its reason; `/spec-diff` routes both
      actions and says the gate is untouched; no skill inlines a competing
      shape.
- [x] **Stays-silent test**: an `unavailable` state emits **no** `live:` line in
      the banner, so a project without isolation sees no trace of a feature it
      does not have.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Doing the rule last is the same call the tier-stack spec made, for the same
reason: the rule should describe a shape that already exists and has been used
rather than one still being designed.

The `live:` line is the second amendment to a deliberately rigid contract in two
specs. That is worth watching — the contract earns its rigidity from real
failures, and two amendments in a row is how a rigid contract quietly becomes a
negotiable one. Each has carried its reason; a third should have to argue harder.

The rule's own paragraph names the thing this phase was most at risk of: a
deliberately rigid contract taking a **second** amendment in two specs. Both
replaced a line rather than adding a paragraph and both carried their reason, so
neither is the drift the contract guards against — but two in a row is how a
rigid contract becomes a negotiable one, so the paragraph raises the bar for a
third and a test asserts that sentence is still there.

One test had to be widened rather than satisfied. `assets-banner-stack`
asserted the three tiers appear in the engine's order by comparing their
**first mention in the whole file** — and §2b now names `network` in prose (to
say there is no action that turns it off) long before `/spec-diff` describes the
stack. The assertion's intent is the order the stack is *written* in, so it now
looks for the three appearing **together** and checks the order there. The old
form was right about the file it was written against and says nothing useful
about this one.
