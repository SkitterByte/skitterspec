# `spec-env` subcommands mis-resolve when run from a worktree

> **Type:** Bug
> **Status:** Complete (2026-07-23)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-10
> **Area:** packages/common/src/cli.js (specEnv dispatch, specEnvIntegrate), packages/common/src/env/resolve.js
> **Stack:** worktree

## Problem

Every `spec-env` subcommand derives repo identity from the current working
directory: `resolveSpec` expands `{repo}` from `basename(dir)`, and the registry
path resolves against `dir`. Run from the **primary checkout** that's correct, but
run from **inside a worktree** it mis-resolves — `spec-env resolve <spec>` from a
worktree prints `worktree: …/{slug}-wt/{slug}` and `project: {slug}_{slug}`, and
`status`/`down`/`up` read the wrong registry and worktree paths (`down` reports a
provisioned spec as "not provisioned"). Surfaced completing `feat-integrate-to-main`:
tearing down from the worktree silently no-op'd. Only `spec-env integrate` is
correct, because it was hand-hardened to anchor on the primary checkout.

## Decisions

1. **Anchor once, centrally, in the `specEnv` dispatch.** After resolving `dir`
   (cwd or `--dir`), replace it with the primary checkout before `loadEnvConfig`
   and every handler — so `up`/`down`/`status`/`resolve`/`integrate` **and** the
   registry path are all fixed by one change. Rejected per-command anchoring
   (repetitive, easy to miss one — this bug already proves that).
2. **Shared helper `resolvePrimaryCheckout(dir, git)`** in `src/env/resolve.js`,
   beside `resolveBaseBranch`: returns `dirname(abspath(git rev-parse
   --git-common-dir))`, falling back to `dir` when git can't answer (not a repo).
   `git` is an injected reader → pure and unit-testable. This is the same recipe
   `specEnvIntegrate` already inlines (Decision 7 of `feat-integrate-to-main`).
3. **Simplify `integrate` to reuse the anchored `dir`.** With the dispatch
   anchoring in place, `mainRepoPath` == `dir`; drop `integrate`'s own
   `git-common-dir` lookup and resolve-against-mainRepoPath dance. No duplicate
   logic, one source of truth.
4. **Purely corrective — zero risk to existing use.** When already run from the
   primary checkout, `primaryCheckout == dir`, so behaviour is unchanged. The fix
   only changes the (currently broken) from-a-worktree path. No API/flag changes.
5. **Test-first (Bug).** A failing unit test for `resolvePrimaryCheckout` (and the
   worktree-simulating case) is written first, then the helper + wiring green it.

## Solution overview

**Helper (`src/env/resolve.js`):**

```js
// dir → the primary checkout root (parent of the shared git dir). Falls back to
// dir when git can't answer. `git(args)` returns trimmed stdout or null.
function resolvePrimaryCheckout(dir, git) {
  const common = git(['rev-parse', '--git-common-dir'])
  return common ? path.dirname(path.resolve(dir, common)) : dir
}
```

- From the primary checkout, `--git-common-dir` is `.git` (relative) →
  `dirname(resolve(dir, '.git'))` = `dir`.
- From a linked worktree it's the absolute `<main>/.git` → parent = `<main>`.

**Dispatch (`src/cli.js` `specEnv`):** after `dir = path.resolve(dir)`, insert
`dir = resolvePrimaryCheckout(dir, gitReader(dir))`, then `loadEnvConfig(dir)` and
dispatch as today. **`specEnvIntegrate`** drops its inline `git-common-dir` block
and uses `dir` for both `resolveSpec` and `mainRepoPath`.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Anchor spec-env on the primary checkout | ✅ | [01-anchor-primary-checkout.md](01-anchor-primary-checkout.md) |

## Open questions

- None. (`spec-sync` subcommands have their own cwd-relative resolution — out of
  scope here; a separate follow-up if it proves to bite.)

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-10 | Draft | backlog | Reuben Greaves |
| 2026-07-10 | In Progress | in-progress | Reuben Greaves |
| 2026-07-23 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-07-10 — Phase 1 complete (single-phase spec — ready for /spec-complete).
  Added `resolvePrimaryCheckout(dir, git)` and anchored the `specEnv` dispatch on
  it before `loadEnvConfig` + the switch, fixing all subcommands (and the registry
  path) at once; simplified `integrate` to reuse the anchored `dir`. Verified live:
  `resolve`/`down` now behave identically from the primary checkout and from inside
  a worktree. 204 tests green (+3). Full live-git integration test deferred (unit +
  manual coverage instead).
- 2026-07-23 — Completed. The original fix (branch `bug/spec-env-cwd-anchor`,
  commit f506bad) was written against the **pre-monorepo flat layout** (`src/…`)
  and, at 51 commits behind, could not be rebased onto the restructured `main`.
  Re-applied the same fix fresh on the current layout (`packages/common/src/…`),
  test-first: added `resolvePrimaryCheckout` + its unit tests, anchored the
  `specEnv` dispatch, and simplified `integrate` to reuse the anchored `dir`.
  Caught a latent bug in the port — `integrate` still referenced a removed
  `mainRepoPath` local when building the `planIntegrate` args; fixed to pass
  `dir`. Suite green (251); verified live from inside a worktree. The obsolete
  branch and worktree were torn down.
- 2026-07-10 — Spec created. Surfaced while completing `feat-integrate-to-main`
  (its own new `integrate` command was hardened against this; the other
  subcommands weren't). Decided: central anchoring in the dispatch via a shared
  `resolvePrimaryCheckout` helper; simplify `integrate` to reuse it; test-first.
