---
linear_issue_id: "SKS-118"
---

# Phase 3 — `--next N` and Linear's backlog order ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-sync list --next 5` returns the five backlog specs Linear's own
Backlog view would put on top, and says so honestly when nothing is prioritised.

## Tasks

- [ ] Order backlog results by `priority` (urgent first, `0`/none last), then
      ascending `sortOrder` — Linear's manual drag-order — as decision 7 sets out.
- [ ] Add `--next N`: implies the backlog state only, applies the ordering, and
      caps at N while printing `showing N of <total> in backlog` (decision 4).
- [ ] Detect the all-unprioritised case — every candidate at priority `0` — and
      print one line saying the order is the manual Backlog order rather than a
      ranking. True of this workspace today, so it is the common case, not an
      edge one.
- [ ] Sort deterministically: break `sortOrder` ties on `identifier` so the same
      workspace state always prints the same rows in the same order, and the
      tests can assert them.
- [ ] Teach the `/spec-list` skill the "next few in the backlog" phrasing and the
      matching MCP-path ordering, so both transports answer the same question.
- [ ] Extend `test/cli-list.test.js`: priority ordering; `sortOrder` within one
      priority; the tie-break; `--next 5` against 23 candidates printing the cap;
      and the all-unprioritised caveat line appearing exactly when it should.
- [ ] Run `pnpm test` in `packages/linear` and at the repo root — green before the
      phase is done.

## Notes

Linear's `sortOrder` is a float and lower sorts higher. Fetch it in
`ISSUE_FIELDS` (phase 1) rather than inferring order from creation date — created
order is what this phase exists to replace.
