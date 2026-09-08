---
linear_issue_id: "SKS-73"
---

# Phase 1 — Retire stale spec-ready claims + guard 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** no shipped surface names the removed `spec-ready` skill or the wrong
skill count, and a test keeps it that way.

## Tasks

- [ ] Rewrite `packages/common/assets/skills/spec-init/SKILL.md:25` — drop
      `spec-ready`, name the current nine lifecycle skills (spec, spec-bug,
      spec-hotfix, spec-review, spec-go, spec-to-main, spec-complete,
      spec-cancel, spec-init), matching `spec-planning.md`'s "nine lifecycle
      skills".
- [ ] Remove the `/spec-ready` row from `packages/common/README.md` (line ~20)
      and fix `packages/skitterspec/README.md:81` if its mention is not
      historical context.
- [ ] Add `spec-ready` (and `spec-env`/`spec-env-down`, retired at the same
      time) as retired phrases in `scripts/docs-claims.test.js` — surfaces
      exclude `MIGRATION.md` files, with a comment naming that blind spot
      (migration docs legitimately reference retired skills), per
      `.claude/rules/negative-checks.md`.
- [ ] Rebuild dists (`pnpm build`) so `packages/skitterspec*/assets` pick up the
      corrected skill.
- [ ] Add/extend tests covering this phase (the docs-claims guard above, plus a
      stays-silent case proving MIGRATION.md mentions don't fire); run
      `pnpm test` — green before the phase is done.
