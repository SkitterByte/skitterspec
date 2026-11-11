---
github_issue_id: "#169"
---

# Phase 3 — Migration guidance and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the migration paragraph covers a whole conversion, from the plan's
phases to its tracker leftovers.

## Tasks

- [ ] `spec-planning.md`: a non-wave phase becomes a member (usually an Issue)
      with its own `Waits on:`; do it on a `/no-spec` branch and check with
      `epic status --here` before landing; the epic's first push retires the
      wave sub-issues
- [ ] Docs: `reference` (`--here`), `github` (retired sub-issues); bump each
      page's `verified:`
- [ ] Tests: asset test pinning the three additions to the paragraph
- [ ] Run typecheck + tests — green before the phase is done
