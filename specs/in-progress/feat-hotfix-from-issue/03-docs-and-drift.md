# Phase 3 — Docs, and the stale adoption prose ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the config reference documents the new label, and the intake fragment
stops describing an overwrite that now happens at a different moment.

## Tasks

- [x] Fix the drift from `feat-lifecycle-tracker-sync` (Decision 6): the fragment
      says "the first `/spec-push` will overwrite the issue's description", but
      the link seam now applies at creation, so the overwrite happens **then**.
      Say what actually happens, and keep the reassurance that the reporter's
      words survive in the spec.
- [x] Re-check the fragment's "do not write a base sidecar" rule against that
      change and confirm it still holds — leaving the base empty is what makes
      the adopting push an update over the reporter's text.
- [x] Document `intake.hotfixLabels` in `linear.config.md` beside `bugLabels`,
      including the precedence rule, and add it to the example config.
- [x] Document starting a hotfix from an issue in the config reference's intake
      section, which currently names only `/spec` and `/spec-bug`.
- [x] Check the distribution README's intake description for the same omission.
- [x] Add tests: the example config carries `hotfixLabels`; `linear.config.md`
      documents it and the precedence; the fragment no longer promises the
      overwrite happens on a later push. Run the project's typecheck and test
      commands — green before the phase is done.

## Notes

The drift is small but lands on the one sentence a reporter would care about —
when their words get overwritten. Worth correcting precisely rather than loosely.

**The "do not write a base sidecar" rule survived the change.** It had to be
re-checked rather than assumed: it reads like an artefact of the old
push-later flow, but it is load-bearing under the new one too: an empty base is
what makes the linking push an **update** over the reporter's text. Recording a
snapshot at adoption would declare the mirror already in sync and strand the
issue showing the raw report — the same failure as before, just reached sooner.

The README passage was more out of date than the task assumed. It described the
composed skills as `/spec`, `/spec-bug` and `/spec-go` — written before
`feat-lifecycle-tracker-sync` put seams in `/spec-complete`, `/spec-cancel`,
`/spec-review` and `/spec-hotfix`. Rewritten to name all of them rather than
only patching in the intake sentence this phase was about.
