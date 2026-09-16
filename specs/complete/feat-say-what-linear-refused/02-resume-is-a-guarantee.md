---
linear_issue_id: "SKS-298"
---

# Phase 2 — Resume is a guarantee, not a comment ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** *"re-run to resume without duplicating"* becomes something a test
proves rather than something the code asserts about itself.

## Tasks

- [x] Test the interrupted push: an adapter that creates the spec issue, then
      throws on the first sub-issue create. Assert the issue's id is stamped on
      the spec, and that a **re-run against the same adapter** produces a plan
      whose issue is an *update* — one issue in Linear, never two.
- [x] Test the interruption at each boundary `applyOneSpec` can fail on: before
      the issue create, between the issue and the first sub-issue, and between
      two sub-issue creates. Each must leave exactly what landed stamped.
- [x] **The hole: a create that succeeds and a stamp that fails.** Cover it with
      a test, then make the failure legible — the issue exists and nothing
      records it, so the message must name the identifier that was created and
      point at `spec-sync reattach` (phase 3) rather than at a re-run, which
      would mint a second.
- [x] Correct the failure line so it only claims what is true. `ids stamped so
      far are saved` is printed even when nothing was created, where the honest
      line is `nothing was created`. Phase 1 adds the distinction; this phase
      makes `apply` carry the count it already knows.
- [x] Stays-silent test: a push that succeeds prints exactly what it prints
      today. This phase changes failure reporting only.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`applyOneSpec` already stamps each id the moment its object exists
(`cli-sync.js:2371`, steps 1 and 2) — so most of this phase is proving a
property the code has rather than adding one. That is deliberate: the claim is
what makes *"just run it again"* safe advice, and advice nobody tested is how a
duplicate gets minted on the one path nobody tried.

**The first task was already done**, found while building phase 1:
`cli-apply.test.js` had *"an interrupted run stamps what it created, then
resumes without duplicating"*. What this phase added is the other two
boundaries and the hole.

**A re-run is RE-PLANNED, and the test nearly failed to say so.** The
between-two-sub-issues test first replayed the stale plan and asserted one
create; it got two, and the instinct was that the code had a gap. It does not —
a plan lists what was missing *when it was computed*, so feeding the old one
back asks for everything again and proves only that the planner was not
consulted. The test now runs the real planner for the re-run and asserts the
plan itself shrank to one create, which is the actual mechanism.

**`created` and `stamped` are different counts, and the gap between them is the
orphan.** Identifiers are recorded **before** their stamp, so a stamp that fails
leaves `created` longer than `stamped` — and those extras are issues Linear
holds that the repo does not point at. Re-running is the one thing that makes
that worse, since the plan still reads the spec as unlinked and would mint a
second. The failure names them and sends the reader to `reattach` (phase 3)
instead.
