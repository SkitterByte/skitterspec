---
github_issue_id: "#165"
---

# Phase 4 — Epic tab: start hand-off, `/epic`, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the epic tab tells the operator what to start where, and keeps the
epic page one command away.

## Tasks

- [x] `/spec-start` §6 on an epic: `Next` names one `/spec-start <member>`
      per free lane, each "in a new tab", and a row carries the epic page
      stack (starting the review server if it is not running)
- [x] Add `packages/common/assets/commands/epic.md`: user-only, pre-executes
      `skitterspec epic status` and relays the table and page stack
- [x] Install the command with `init`/`update` like the other four
- [x] Docs: `review` (the epic page) and `reference` (`epic status` member
      table, bare form, `/epic`); bump each page's `verified:`
- [x] Tests: asset test for the `/spec-start` epic hand-off and the command's
      pre-executed verb; install test for `/epic`
- [x] Run typecheck + tests — green before the phase is done

## Notes

- Commands are discovered from `assets/commands/`, so installing `/epic` needed
  no list; the exhaustive command test and the published-docs check (its token
  pattern now knows `/epic`) did. `/epic` is listed in both READMEs, the common
  README and `docs/index.html`'s command chips.
