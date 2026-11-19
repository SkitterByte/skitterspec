---
github_issue_id: "#245"
---

# Phase 4 — Surfacing: `/spec-todo` and the tracker summary block ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a parked spec reads as parked rather than stalled, both in the
morning report and on the ticket. Proven by digest and projection tests.

## Tasks

- [ ] `skitterspec todo` (`tada/todo.js`): mark in-flight specs with blockers
      as `parked — blocked on <text>`, and as `ready to resume` once an
      `until` date has passed, with `/spec-resume <name>` as their next action.
- [ ] `sync-core/src/summary.js`: add a `Blocked on` line to the summary block
      when `blockers()` returns any, and leave it out when there are none. It
      sets no Status.
- [ ] Update the provider docs pages (github, linear, jira, azure-boards) and
      `reference` for the new block line, `spec-env resume`, `/spec-resume` and
      `/spec-park`. Bump each page's `verified:`.
- [ ] Tests: a todo digest with a parked spec and with an expired `until`; a
      summary block with and without a blocker, where without must stay
      byte-identical to today so existing tickets don't drift. Run
      `pnpm test` and `node scripts/docs-freshness.js check`, green.
