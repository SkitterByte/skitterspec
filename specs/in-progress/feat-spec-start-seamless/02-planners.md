---
linear_issue_id: "SKS-99"
---

# Phase 2 — Both planners commit, gate and assert ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-env up` plans a commit when the whole dirty tree is the spec's own,
refuses when any of it is not, and refuses when the spec is not in the base
branch's tree — identically in worktree and checkout mode.

## Tasks

- [x] Extend both planners' `ctx` with `dirtyPaths` (repo-relative) and
      `specOnBase` (boolean, or `null` when it could not be determined). Keep them
      pure — the CLI supplies the git facts, as it already does for `clean`.
- [x] `planUp` (worktree mode): add the clean gate it currently lacks, expressed
      through `classifyDirtyTree` so it can pass with owned-only dirt.
- [x] `planCheckoutUp`: replace the flat `!ctx.clean` refusal with the same
      classification. Keep the existing "already attached" early return **ahead** of
      it — a re-run on the spec's own branch is legitimately dirty mid-phase and must
      stay unrefused (`src/env/provision.js:193`).
- [x] When every dirty path is owned, prepend the commit to `result.commands`:
      `git add <owned paths>` then `git commit -m "chore(spec): <add|update> <name>"`.
      Subject is `add` when the spec folder is wholly untracked, `update` otherwise.
      Compose no `Refs:` trailer — see the spec's Decisions.
- [x] When any path is foreign, block with today's wording plus the foreign paths,
      so the operator can see exactly what disqualified the tree.
- [x] Add the `specOnBase` assertion: when false, block naming the branch that does
      have the spec (the CLI finds it; the planner just reports what it is given).
      When `null` — could not be determined — do **not** block; carry on and say so.
- [x] Extend `packages/common/test/env-provision.test.js` and
      `env-provision-checkout.test.js`: owned-only dirt plans the commit first;
      foreign dirt blocks; clean tree is byte-identical to today's plan; `specOnBase`
      false blocks with the other branch named; `specOnBase` null does not block;
      checkout mode's "already attached" re-run still passes with a dirty tree.
- [x] Run `node --test` — green before the phase is done.

## Notes

**As built.**

- The three outcomes live in one shared `planSpecCommit(spec, ctx, config, opts)`
  that both planners call, rather than a copy each. A second copy is a copy that
  drifts, which is the same reason the spec put this in the engine at all.
- `planUp` takes `ctx` as an optional **fourth** argument, and `planCheckoutUp`
  still honours `ctx.clean` when `dirtyPaths` is absent. An absent list means
  *nobody looked* — not *the tree is clean* — so it falls back to the old
  behaviour instead of being read as permission to commit.
- **Order matters, and not the order the plan implied.** `specOnBase` is false
  precisely *because* the spec is uncommitted, so the on-base refusal has to come
  **after** the commit decision — otherwise the gate would refuse the exact tree
  it was built to fix. Covered by its own test.
- The `add` vs `update` subject is inferred from git collapsing a wholly-untracked
  directory into one bare entry. Passing `-uall` upstream would flatten that
  signal and make every subject `update`; noted in phase 3's task, cosmetic only.
