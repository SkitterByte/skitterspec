# Phase 2 — The `inline` projection ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a spec in an `inline` bucket pushes as one issue whose description
carries every phase with its full task list, mints no new sub-issues, and leaves
any already-linked sub-issue working.

## Tasks

- [x] Add `inline` to `PHASE_MAPPINGS`.
- [x] Under `inline`, project no *new* sub-issues; keep projecting any phase that
      already carries an id, so a live sub-issue is never frozen (Decision 4).
- [x] Render each unlinked phase into the description as `### <phase name>`
      followed by the body `subIssueBody` already produces, so both surfaces
      share one composer and one fidelity guarantee.
- [x] Keep the `## Phases` index under `inline` — move the strip decision from
      the `fieldOwnership` bind at `normalize.js:617` onto the resolved mode
      (Decision 5), leaving `fieldOwnership` meaning only which fields sync.
- [x] Confirm the mixed state renders coherently: a spec with some linked and
      some unlinked phases must not show a phase both inline and as a sub-issue.
- [x] Add tests: an `inline` spec projects one issue, no sub-issue creates, and a
      description containing every phase's tasks; the `## Phases` index survives
      under `inline` and is still stripped under `subissue`; a phase with an id
      keeps its sub-issue and is not also inlined; a repo with `complete: inline`
      and `backlog: subissue` produces both shapes in one run; `subissue`
      behaviour is byte-identical to before. Run the project's test command —
      green before the phase is done.

## Notes

Acceptance from the report: `inline` produces a single issue whose description
contains every phase with its full task list, `subissue` is untouched, and the
two coexist in one repo. All three are asserted in
`packages/sync-core/test/sync-inline-phases.test.js`; the full suite is green at
766 tests.

**Deviation — heading depth.** The spec sketched `### <phase name>` followed by
the body "exactly as `subIssueBody` projects it". Emitted verbatim the body's
own `## Tasks` is a SIBLING of `## Problem`, not a child of the phase, so every
following phase collapses under it in the outline. The projected body is
therefore demoted two levels (`##` → `####`) by `demoteHeadings`, which changes
`#` run lengths and nothing else — fenced content is masked, and depth clamps at
h6. The single-composer guarantee is unaffected and now asserted directly: the
inline section body equals the sub-issue body with `^## ` → `#### `.

**`withheld` vs `inlined`.** `phaseProjection` returns them separately.
`deferred` and `inline` filter the sub-issues identically, but a phase that
inlined is not missing from the mirror, so counting it in `withheld` would make
the CLI's "N phases deferred" line say the opposite of what happened.
`phasesWithheld` and `plan.phasesDeferred` keep their exact meaning and needed no
change.

The `> Spec: …` line and the index's `01-*.md` links stay repo-relative in the
tracker. Pre-existing in the sub-issue form and inherited here by sharing the
composer — not introduced by `inline`.
