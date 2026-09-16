---
linear_issue_id: "SKS-298"
---

# Phase 2 — Resume is a guarantee, not a comment ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** *"re-run to resume without duplicating"* becomes something a test
proves rather than something the code asserts about itself.

## Tasks

- [ ] Test the interrupted push: an adapter that creates the spec issue, then
      throws on the first sub-issue create. Assert the issue's id is stamped on
      the spec, and that a **re-run against the same adapter** produces a plan
      whose issue is an *update* — one issue in Linear, never two.
- [ ] Test the interruption at each boundary `applyOneSpec` can fail on: before
      the issue create, between the issue and the first sub-issue, and between
      two sub-issue creates. Each must leave exactly what landed stamped.
- [ ] **The hole: a create that succeeds and a stamp that fails.** Cover it with
      a test, then make the failure legible — the issue exists and nothing
      records it, so the message must name the identifier that was created and
      point at `spec-sync reattach` (phase 3) rather than at a re-run, which
      would mint a second.
- [ ] Correct the failure line so it only claims what is true. `ids stamped so
      far are saved` is printed even when nothing was created, where the honest
      line is `nothing was created`. Phase 1 adds the distinction; this phase
      makes `apply` carry the count it already knows.
- [ ] Stays-silent test: a push that succeeds prints exactly what it prints
      today. This phase changes failure reporting only.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`applyOneSpec` already stamps each id the moment its object exists
(`cli-sync.js:2371`, steps 1 and 2) — so most of this phase is proving a
property the code has rather than adding one. That is deliberate: the claim is
what makes *"just run it again"* safe advice, and advice nobody tested is how a
duplicate gets minted on the one path nobody tried.
