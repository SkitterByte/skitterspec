---
linear_issue_id: "SKS-81"
---

# Phase 4 — Land, tear down, refuse ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a checkout-mode spec completes as cleanly as a worktree one, and the
two commands that have no meaning in checkout mode say so by name.

## Tasks

- [x] Give `spec-env integrate` a checkout-mode plan: rebase the spec branch onto
      base in place, switch to base, fast-forward. It replaces the hardcoded
      `git -C <worktreePath> rebase` at `integrate.js:40`, which cannot resolve
      without a worktree.
- [x] Give `spec-env down` a checkout-mode teardown: switch back to base, then
      delete the branch — no worktree removal, no slot, no volumes. Keep the
      existing guards (refuse a dirty or unlanded branch without `--force`).
- [x] Make `spec-env live` and `spec-env connect` refuse in checkout mode with a
      reason that names the mode — the work is already in the operator's
      checkout, so there is nothing to overlay or proxy (Decision 6).
- [x] Amend `/spec-complete` and `/spec-to-main`: their landing and teardown
      sections currently qualify on "the spec is on a worktree", which must
      become "isolation is enabled", with the engine choosing the plan by mode.
- [x] Amend `/spec-init` and `.claude/rules/spec-planning.md` so the isolation
      description names both modes and the trade between them.
- [x] **Fix `live take`'s rebase diagnosis — it names the wrong cause.**
      `cli.js:1250-1257` treats *any* non-zero `git rebase` exit as
      "hit conflicts — resolve them in <worktree>", discards git's own stderr,
      and then runs `rebase --abort` on a rebase that may never have started.
      Observed 2026-09-08 — the real cause was an unstaged file, and the message
      sent two people hunting a conflict that did not exist. Report git's actual
      failure, and distinguish "refused to start" from "started and conflicted".
- [x] **Check the tree the operation actually touches.** The planner computes
      `clean` from the PRIMARY checkout (`cli.js:1211`) and then rebases the
      WORKTREE, whose state it never inspects — so a dirty worktree reaches the
      rebase and fails there instead of being refused up front with a reason.
      Add the worktree to the preconditions in `live.js`, alongside the existing
      primary-checkout check.
- [x] **Stop assuming the `skitterspec` binary name resolves.** Both shipped
      commands invoke `skitterspec` (`assets/commands/spec-connect.md`,
      `spec-live.md`), and the `spec-sync` skill states the superset "also
      answers to `skitterspec`". True for a consumer of the published superset;
      not true wherever only the provider package is installed. Decide whether
      the commands should name the binary the install actually provides, or
      whether every provider must alias `skitterspec` — and say which in the
      provider contract, because today it is assumed rather than stated.
- [x] Rebuild dists (`pnpm build`).
- [x] Add/extend tests covering this phase: checkout-mode integrate and teardown
      plans, both refusals firing with the mode named, and **stays-silent** cases
      proving worktree-mode integrate/teardown/live/connect plans are unchanged.
      Run `pnpm test` — green before the phase is done.

## Notes

The two rebase-diagnosis tasks are not checkout-mode work as such — they were
found while taking a spec live during `feat-skill-efficiency-pass` — but they
live in the same `live`/`integrate` code this phase already rewrites, so fixing
them here costs one pass instead of two.

Verify a full checkout-mode spec end to end before calling this done: `/spec-go`
→ commit → `/spec-complete`, with the branch landing on `main` and the checkout
returned to base.
