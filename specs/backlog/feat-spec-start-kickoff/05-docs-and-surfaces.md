---
linear_issue_id: "SKS-153"
---

# Phase 5 — Docs, compose and shipped-surface guards ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the new shape is described where adopters read, and every shipped
surface carries it consistently.

## Tasks

- [ ] Update `packages/common/assets/rules/spec-planning.md`: the skill table's
      `/spec-start` row, and the isolation paragraph that currently describes the
      hand-off as the only worktree-mode ending.
- [ ] Update `packages/common/README.md` where it describes starting a spec.
- [ ] Document `spec-env resolve`'s two new flags in
      `packages/common/assets/core/env.config.md` or the CLI usage text,
      wherever the other `spec-env` verbs are documented.
- [ ] Rebuild the composed distributions (`npm run build`) and resync this
      repo's own `.claude/` install, so the self-hosted copy matches.
- [ ] Extend the assets tests so the new shape is guarded across all shipped
      surfaces, the way `33c6479` guarded the last one.
- [ ] Add a `MIGRATION.md` note: `/spec-start` now pushes on its own and offers
      phase 1 — behaviour adopters will notice, even though nothing is removed.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

`scripts/docs-claims.test.js` and `scripts/skill-budget.test.js` both police this
kind of change — check them early rather than at the end, since a skill that has
grown past its budget is a rewrite, not a tweak.
