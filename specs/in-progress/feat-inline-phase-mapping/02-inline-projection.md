# Phase 2 — The `inline` projection ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a spec in an `inline` bucket pushes as one issue whose description
carries every phase with its full task list, mints no new sub-issues, and leaves
any already-linked sub-issue working.

## Tasks

- [ ] Add `inline` to `PHASE_MAPPINGS`.
- [ ] Under `inline`, project no *new* sub-issues; keep projecting any phase that
      already carries an id, so a live sub-issue is never frozen (Decision 4).
- [ ] Render each unlinked phase into the description as `### <phase name>`
      followed by the body `subIssueBody` already produces, so both surfaces
      share one composer and one fidelity guarantee.
- [ ] Keep the `## Phases` index under `inline` — move the strip decision from
      the `fieldOwnership` bind at `normalize.js:617` onto the resolved mode
      (Decision 5), leaving `fieldOwnership` meaning only which fields sync.
- [ ] Confirm the mixed state renders coherently: a spec with some linked and
      some unlinked phases must not show a phase both inline and as a sub-issue.
- [ ] Add tests: an `inline` spec projects one issue, no sub-issue creates, and a
      description containing every phase's tasks; the `## Phases` index survives
      under `inline` and is still stripped under `subissue`; a phase with an id
      keeps its sub-issue and is not also inlined; a repo with `complete: inline`
      and `backlog: subissue` produces both shapes in one run; `subissue`
      behaviour is byte-identical to before. Run the project's test command —
      green before the phase is done.

## Notes

Acceptance from the report: `inline` produces a single issue whose description
contains every phase with its full task list, `subissue` is untouched, and the
two coexist in one repo.
