# Phase 2 — Apply it: matrix, shared helper, or both ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the decision from phase 1 is in place, and a person running the suite
locally knows what that result does and does not predict.

## Tasks

- [ ] Apply whatever phase 1 decided — the `os` matrix in `ci.yml`, the shared
      wait helper, or both.
- [ ] Where a helper lands, replace the ad hoc waits the audit found with it, so
      there is one correct way to wait rather than several.
- [ ] Update `RELEASING.md`: the pre-tag suite is real and valuable, and it runs
      on the releaser's platform — say what that leaves uncovered.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands — green before the phase is done.

## Notes

If the matrix is adopted, verify it actually runs both platforms on a real push
before closing the phase — a matrix that silently degrades to one leg is the
same gap wearing a green tick.
