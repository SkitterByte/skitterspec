---
github_issue_id: "#245"
---

# Phase 4 — Surfacing: `/spec-todo` and the tracker summary block ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a parked spec reads as parked rather than stalled, both in the
morning report and on the ticket. Proven by digest and projection tests.

## Tasks

- [x] `skitterspec todo` (`tada/todo.js`): mark in-flight specs with blockers
      as `parked — blocked on <text>`, and as `ready to resume` once an
      `until` date has passed, with `/spec-resume <name>` as their next action.
- [x] `sync-core/src/summary.js`: add a `Blocked on` line to the summary block
      when `blockers()` returns any, and leave it out when there are none. It
      sets no Status.
- [x] Update the provider docs pages (github, linear, jira, azure-boards) and
      `reference` for the new block line, `spec-env resume`, `/spec-resume` and
      `/spec-park`. Bump each page's `verified:`.
- [x] Tests: a todo digest with a parked spec and with an expired `until`; a
      summary block with and without a blocker, where without must stay
      byte-identical to today so existing tickets don't drift. Run
      `pnpm test` and `node scripts/docs-freshness.js check`, green.

## Notes

- `/spec-todo` lists only the blocker that holds the next build
  (`blockingNext`): a wait planned for a later phase is not yet in the way.
  The `ready to resume` check compares local calendar days.
- The spec's ticket block carries the spec-level line, and each phase
  sub-issue's block carries its own. Under `mapping.phases: "none"` a phase's
  blocker therefore reaches no ticket. That is accepted, since the spec still
  carries it and `/spec-todo` shows it.
