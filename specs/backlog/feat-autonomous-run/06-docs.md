---
github_issue_id: "#301"
---

# Phase 6 — Docs and rules ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the new mode is documented where readers look; docs freshness clean.

## Tasks

- [ ] `env.config.md`: the `auto` block
- [ ] `spec-format.md`: the `Run:` header
- [ ] `spec-planning.md`: one paragraph on autonomous runs (within the
      instruction budget)
- [ ] `spec-reports.md`: the final banner's exits for `pause`
- [ ] `docs/review.html`, `docs/reference.html`: snapshots, run index,
      final page, `spec-env run`; `node scripts/docs-freshness.js verify review reference`
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/project-conventions.md`) — green before
      the phase is done.
