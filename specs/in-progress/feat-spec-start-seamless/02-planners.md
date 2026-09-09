---
linear_issue_id: "SKS-99"
---

# Phase 2 — Both planners commit, gate and assert ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-env up` plans a commit when the whole dirty tree is the spec's own,
refuses when any of it is not, and refuses when the spec is not in the base
branch's tree — identically in worktree and checkout mode.

## Tasks

- [ ] Extend both planners' `ctx` with `dirtyPaths` (repo-relative) and
      `specOnBase` (boolean, or `null` when it could not be determined). Keep them
      pure — the CLI supplies the git facts, as it already does for `clean`.
- [ ] `planUp` (worktree mode): add the clean gate it currently lacks, expressed
      through `classifyDirtyTree` so it can pass with owned-only dirt.
- [ ] `planCheckoutUp`: replace the flat `!ctx.clean` refusal with the same
      classification. Keep the existing "already attached" early return **ahead** of
      it — a re-run on the spec's own branch is legitimately dirty mid-phase and must
      stay unrefused (`src/env/provision.js:193`).
- [ ] When every dirty path is owned, prepend the commit to `result.commands`:
      `git add <owned paths>` then `git commit -m "chore(spec): <add|update> <name>"`.
      Subject is `add` when the spec folder is wholly untracked, `update` otherwise.
      Compose no `Refs:` trailer — see the spec's Decisions.
- [ ] When any path is foreign, block with today's wording plus the foreign paths,
      so the operator can see exactly what disqualified the tree.
- [ ] Add the `specOnBase` assertion: when false, block naming the branch that does
      have the spec (the CLI finds it; the planner just reports what it is given).
      When `null` — could not be determined — do **not** block; carry on and say so.
- [ ] Extend `packages/common/test/env-provision.test.js` and
      `env-provision-checkout.test.js`: owned-only dirt plans the commit first;
      foreign dirt blocks; clean tree is byte-identical to today's plan; `specOnBase`
      false blocks with the other branch named; `specOnBase` null does not block;
      checkout mode's "already attached" re-run still passes with a dirty tree.
- [ ] Run `node --test` — green before the phase is done.
