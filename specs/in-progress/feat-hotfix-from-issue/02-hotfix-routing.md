# Phase 2 — Route production issues to it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** an issue labelled for production sends you to `/spec-hotfix` instead of
letting you fix it on `main` and wonder later why it never shipped.

## Tasks

- [ ] Add `intake.hotfixLabels` to the config loader, mirroring `intake.bugLabels`
      exactly — a string array, normalised through `stringList`, empty by default.
- [ ] Route in the intake fragment: an issue carrying a `hotfixLabels` label is a
      production bug. Say so, name the matching label, tell the user to run
      `/spec-hotfix <ISSUE-REF>`, and stop — the same shape as the existing bug
      routing.
- [ ] Make hotfix routing take precedence over bug routing when an issue carries
      both (Decision 5), and say why in the fragment so it does not read as an
      accident.
- [ ] Skip the routing check when already in `/spec-hotfix`, exactly as the bug
      check is skipped inside `/spec-bug`.
- [ ] Leave behaviour unchanged when `hotfixLabels` is unset — nothing routes,
      matching how `bugLabels` behaves today.
- [ ] Add tests: the config default and merge; an issue with only a hotfix label
      routes; one with both labels routes to hotfix, not bug; with `hotfixLabels`
      unset nothing routes; the fragment states the precedence and its reason.
      Run the project's typecheck and test commands — green before the phase is
      done.
