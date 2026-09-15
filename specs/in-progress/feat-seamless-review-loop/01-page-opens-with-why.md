---
linear_issue_id: "SKS-246"
---

# Phase 1 — The page opens with why ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a reviewer arriving on a phone reads what the change is for and what
it touches before the first filename — composed from the spec files, so it costs
no model tokens however large the diff.

## Tasks

- [x] Extend `readPhases` (`packages/common/src/env/resolve.js`) to return the
      **live phase's body** — its `n`, title, goal line and tasks — beside the
      counts it already returns. Live is the `🔄` phase, else the highest `✅`
      one (Decision 3).
- [x] Add `context` to `collectReview`'s page data
      (`packages/common/src/env/review.js`): `problem`, `impact` rows, and that
      phase. Read from `00-overview.md` by heading, the way the overview's own
      sections are already addressed.
- [x] Render it above `#files` in `page.html`: the problem, the Impact table,
      then the phase's goal and tasks. **Collapsed past the first paragraph** so
      the file list is still reachable without scrolling a phone (Decision 2).
- [x] **A spec that cannot be parsed yields no header, not an empty one** — a
      legacy bare `<name>.md`, an overview with inline phases, a spec with no
      `## Problem`. Absence is the ordinary state for those, and the page worked
      without any of this yesterday.
- [x] Tests, driving the real page as `assets-review.test.js` establishes: the
      header carries the problem, the impact rows and the live phase's tasks;
      the `🔄` phase wins over a later `✅` one; the file list is still present
      and reachable.
- [x] **Stays silent** (`.claude/rules/negative-checks.md` rule 3): a spec with
      no parseable context renders exactly the page it renders today — no
      header, no empty box, no warning.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

`readPhases` was written for `feat-page-knows-the-phase` and deliberately
returns only `{ total, done, hasNextPhase }` — the button needed a count and
nothing more. Widening it is the right move rather than a second walker, but
keep `hasNextPhase` answering exactly as it does: the button reasons from it,
and that reasoning is tested.
