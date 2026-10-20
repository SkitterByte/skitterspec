---
linear_issue_id: "SKS-392"
---

# Phase 1 — Parse `afterLand` and print it in the land plans ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `afterLand` is parsed, and `integrate` / `hotfix land` print it where
Decisions 3–5 say; proven by unit tests with the key absent staying byte-identical.

## Tasks

- [x] Add `afterLand` to `DEFAULT_CONFIG`, `defaults()`, `mergeConfig` and the
      shape comment in `env/config.js`, normalised with `normalizeSetup`'s rule
- [x] Return `afterLand: { cwd, commands }` from `planIntegrate` (cwd =
      `mainRepoPath`) and `planIntegrateCheckout` (cwd = `checkoutPath`),
      including on the noop branch; empty on blocked
- [x] Return it from `planHotfixLand` only when `cherryPickMain !== false` and
      the plan is neither blocked nor noop
- [x] Print the "then, in the primary checkout (<cwd>), run:" section in
      `specEnvIntegrate` (worktree + checkout, plan + already-landed) and
      `specEnvHotfix`, only when non-empty
- [x] Document `afterLand` in `packages/common/assets/core/env.config.md`
      (when it runs, literal, who runs it, failure doesn't undo the land)
- [x] Tests: parsing/normalising + default in `env-config.test.js`; planner
      fields in `env-integrate.test.js` / `env-hotfix.test.js` (noop, blocked,
      checkout, `cherryPickMain: false`); CLI output in
      `cli-spec-env-integrate.test.js`; **stays-silent** — key absent ⇒ output
      unchanged in every case (`.claude/rules/negative-checks.md` rule 3)
- [x] Run the project's typecheck and test commands — green before the phase is
      done
