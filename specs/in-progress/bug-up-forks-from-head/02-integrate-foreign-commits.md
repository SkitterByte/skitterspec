---
github_issue_id: "#321"
---

# Phase 2 — integrate names another spec's commits ⬜

**Goal:** a branch that already carries another spec's commits, from before
phase 1 or from a fork made by hand, is caught before the fast-forward, never
after it.

## Tasks

- [ ] RED — real repo: spec A's branch with commits, B forked from A's tip with
      its own commit. `integrate B` refuses before any rebase or ff, naming A's
      commits (short sha + subject) and `feat-a` as their owner.
- [ ] Ownership, positive signals only, over `landRange(base, branch)`:
      - the commit is reachable from another in-flight spec's branch (registry
        and worktree list);
      - its `Refs:` trailer names a ref stamped on another spec;
      - its paths touch only another spec's folder under `specs/*/`.
      Any one of these refuses, with the commits and the owner named and the
      exit stated (land the owner first, or rebase B `--onto` the base past
      them).
- [ ] Cannot-tell (no trailer, no owner found, an unreadable range) never
      refuses. A `Refs:` that differs from B's own but matches no spec **warns**
      above the plan and carries on (negative-checks rule 4).
- [ ] Stays-silent tests: a clean B; B whose commits carry B's own `Refs:`; B
      under a stacked base where A has already landed on the base.
- [ ] Update `docs/reference.html` `spec-env integrate` row; `verify reference`.
- [ ] GREEN — `pnpm test`.
