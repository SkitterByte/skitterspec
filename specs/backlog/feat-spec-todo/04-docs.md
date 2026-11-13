---
github_issue_id: "#206"
---

# Phase 4 — Docs and rules ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the docs pages, the rules and CLAUDE.md describe `/spec-todo`, the
wins and the guard. Proven by the prose, docs-freshness and skill-count
tests.

## Tasks

- [ ] `spec-planning.md` (assets):
      - add a `/spec-todo` row to the skill table;
      - extend the `/spec-tada` paragraph with the home scope and wins;
      - add a guard paragraph beside `/allow-main`, explaining why it is
        user-only.
- [ ] `claude-md-section.md` and `CLAUDE.md`: one sentence each on
      `/spec-todo` and the project guard.
- [ ] `docs/index.html` and `docs/reference.html`: add `skitterspec todo`,
      `spec-env project`, `/allow-project` and `guards.projectBoundary`, then
      bump `verified:`.
- [ ] `env.config.md`: document `guards.projectBoundary`.
- [ ] Update skill and command counts in the tests and docs.
- [ ] Run `pnpm test` and `node scripts/docs-freshness.js impact`. Tests
      must be green.
