---
linear_issue_id: "SKS-81"
---

# Phase 4 — Land, tear down, refuse ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a checkout-mode spec completes as cleanly as a worktree one, and the
two commands that have no meaning in checkout mode say so by name.

## Tasks

- [ ] Give `spec-env integrate` a checkout-mode plan: rebase the spec branch onto
      base in place, switch to base, fast-forward. It replaces the hardcoded
      `git -C <worktreePath> rebase` at `integrate.js:40`, which cannot resolve
      without a worktree.
- [ ] Give `spec-env down` a checkout-mode teardown: switch back to base, then
      delete the branch — no worktree removal, no slot, no volumes. Keep the
      existing guards (refuse a dirty or unlanded branch without `--force`).
- [ ] Make `spec-env live` and `spec-env connect` refuse in checkout mode with a
      reason that names the mode — the work is already in the operator's
      checkout, so there is nothing to overlay or proxy (Decision 6).
- [ ] Amend `/spec-complete` and `/spec-to-main`: their landing and teardown
      sections currently qualify on "the spec is on a worktree", which must
      become "isolation is enabled", with the engine choosing the plan by mode.
- [ ] Amend `/spec-init` and `.claude/rules/spec-planning.md` so the isolation
      description names both modes and the trade between them.
- [ ] Rebuild dists (`pnpm build`).
- [ ] Add/extend tests covering this phase: checkout-mode integrate and teardown
      plans, both refusals firing with the mode named, and **stays-silent** cases
      proving worktree-mode integrate/teardown/live/connect plans are unchanged.
      Run `pnpm test` — green before the phase is done.

## Notes

Verify a full checkout-mode spec end to end before calling this done: `/spec-go`
→ commit → `/spec-complete`, with the branch landing on `main` and the checkout
returned to base.
