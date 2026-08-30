# Phase 2 — Route production issues to it ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** an issue labelled for production sends you to `/spec-hotfix` instead of
letting you fix it on `main` and wonder later why it never shipped.

## Tasks

- [x] Add `intake.hotfixLabels` to the config loader, mirroring `intake.bugLabels`
      exactly — a string array, normalised through `stringList`, empty by default.
- [x] Route in the intake fragment: an issue carrying a `hotfixLabels` label is a
      production bug. Say so, name the matching label, tell the user to run
      `/spec-hotfix <ISSUE-REF>`, and stop — the same shape as the existing bug
      routing.
- [x] Make hotfix routing take precedence over bug routing when an issue carries
      both (Decision 5), and say why in the fragment so it does not read as an
      accident.
- [x] Skip the routing check when already in `/spec-hotfix`.
      **Not "exactly as" the bug check is skipped** — the skips differ per
      skill; see Notes.
- [x] Leave behaviour unchanged when `hotfixLabels` is unset — nothing routes,
      matching how `bugLabels` behaves today.
- [x] Add tests: the config default and merge; an issue with only a hotfix label
      routes; one with both labels routes to hotfix, not bug; with `hotfixLabels`
      unset nothing routes; the fragment states the precedence and its reason.
      Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**The plan's skip rule was wrong.** Following it literally would have left the
very gap this phase exists to close. It said to skip routing in `/spec-hotfix`
"exactly as the bug check is skipped inside `/spec-bug`" — one blanket skip per
bug-path skill. But a skip exists to stop a skill routing to *itself*, not to
swallow an escalation. Under the blanket rule, `/spec-bug SKI-123` on a
production-labelled issue would say nothing, the fix would land on `main`, and
prod would stay broken — precisely the failure the routing was added to prevent.

The skips are therefore per-check, not per-skill:

| In | bug check | hotfix check |
|----|-----------|--------------|
| `/spec` | runs | runs |
| `/spec-bug` | skipped (self-loop) | **runs** — it is an escalation |
| `/spec-hotfix` | skipped | skipped — nowhere more specific to go |

The compose suite's self-loop guard was rebuilt around that distinction rather
than around the old sentence, so it asserts both halves: no skill routes to
itself, and `/spec-bug` can still escalate.
