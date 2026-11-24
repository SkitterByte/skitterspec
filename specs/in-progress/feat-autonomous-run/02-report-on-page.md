---
github_issue_id: "#297"
---

# Phase 2 — Report table on every review page ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the end-of-phase report table shown in the terminal also appears on
the review page, for supervised and autonomous runs alike; proven by render
tests.

## Tasks

- [x] Add `spec-env review --report <file>`: a JSON list of `{field, value}`
      rows, stored per phase beside the notes sidecar
- [x] Render the stored rows as a table at the top of the page, field order as
      `spec-reports.md` defines; absent rows render nothing (no empty box)
- [x] Keep `Follow-ups` and `Notes` addressable per phase so phase 3 can
      aggregate them
- [x] Stays-silent test: a render with no `--report` is byte-identical to today
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/project-conventions.md`) — green before
      the phase is done.
