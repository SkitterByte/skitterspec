# Phase 3 — Docs, and the stale adoption prose ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the config reference documents the new label, and the intake fragment
stops describing an overwrite that now happens at a different moment.

## Tasks

- [ ] Fix the drift from `feat-lifecycle-tracker-sync` (Decision 6): the fragment
      says "the first `/spec-push` will overwrite the issue's description", but
      the link seam now applies at creation, so the overwrite happens **then**.
      Say what actually happens, and keep the reassurance that the reporter's
      words survive in the spec.
- [ ] Re-check the fragment's "do not write a base sidecar" rule against that
      change and confirm it still holds — leaving the base empty is what makes
      the adopting push an update over the reporter's text.
- [ ] Document `intake.hotfixLabels` in `linear.config.md` beside `bugLabels`,
      including the precedence rule, and add it to the example config.
- [ ] Document starting a hotfix from an issue in the config reference's intake
      section, which currently names only `/spec` and `/spec-bug`.
- [ ] Check the distribution README's intake description for the same omission.
- [ ] Add tests: the example config carries `hotfixLabels`; `linear.config.md`
      documents it and the precedence; the fragment no longer promises the
      overwrite happens on a later push. Run the project's typecheck and test
      commands — green before the phase is done.

## Notes

The drift is small but lands on the one sentence a reporter would care about —
when their words get overwritten. Worth correcting precisely rather than loosely.
