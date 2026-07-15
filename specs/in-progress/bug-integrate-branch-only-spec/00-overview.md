# Bug: spec-env integrate can't find a spec authored only on its branch

> **Type:** Bug
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-15
> **Area:** packages/common/src/env/resolve.js, packages/common/src/cli.js

## Symptom

`skitterspec spec-env integrate <spec>` fails with:

```
skitterspec: spec not found under specs/**: feat-monorepo-release-process
```

even though the spec's worktree exists and its branch is cleanly mergeable into
the base. Hit during `/spec-complete` for `feat-monorepo-release-process`, whose
spec folder was authored directly on its branch and never committed to `main`.
Integration had to be driven by hand (`git rebase` + `git merge --ff-only`)
instead of via the printed plan.

## Root cause

`spec-env integrate` (`packages/common/src/cli.js`, `specEnvIntegrate`) resolves
the spec against the **primary checkout** — `resolveSpec(specArg, mainRepoPath,
config)` — on purpose, so the worktree path and base branch anchor to `main`
rather than to the worktree it's invoked from. But `resolveSpec` →
`findSpecFolder` (`packages/common/src/env/resolve.js`) only scanned `specs/**`
under that single `dir`. A spec authored entirely on its branch has **no folder
in the primary checkout** (it was never committed to base), so `findSpecFolder`
returned `null` and `resolveSpec` threw `spec not found under specs/**` — despite
the worktree and a mergeable branch being right there. The normal flow only works
because a spec is usually committed to the base's `specs/backlog/` before
branching, so the folder *is* present in the primary checkout.

## Failing test (red)

`packages/common/test/env-resolve.test.js` →
`resolveSpec: searchDirs finds a spec that lives only in a worktree`. It scaffolds
a primary checkout **without** the spec and a separate worktree checkout **with**
it (in `complete/`), asserts the current `spec not found` throw reproduces, then
asserts a fallback search dir resolves it while keeping `worktreePath`/`branch`
anchored to the primary checkout.

Run: `node --test packages/common/test/env-resolve.test.js`. Red failure before
the fix:

```
✖ resolveSpec: searchDirs finds a spec that lives only in a worktree
  Error: spec not found under specs/**: feat-branch-only
      at resolveSpec (packages/common/src/env/resolve.js:156:11)
```

## Fix

- [x] `findSpecFolder(specArg, dir, extraDirs = [])` — search `dir` first, then
      each fallback root in order (`specs/<bucket>/<name>`).
- [x] `resolveSpec(specArg, dir, config, opts = {})` — thread `opts.searchDirs`
      into `findSpecFolder`; identity/coordinate tokens still expand against `dir`
      (the primary checkout), so a worktree-only spec still resolves to the right
      base.
- [x] `specEnvIntegrate` — derive the worktree path from config
      (`{repo}`/`{slug}` tokens; no folder needed) and pass it as `searchDirs`, so
      a branch-only spec is found in its worktree.
- [x] Failing test now passes (GREEN); full suite green (215) — no regressions.
- [x] Rebuild the dists (`npm run build`) so the vendored CLI reflects the source
      fix. No follow-up hardening needed.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-15 — Bug reproduced; failing test added (red).
- 2026-07-15 — Fixed: `findSpecFolder`/`resolveSpec` accept fallback search dirs
  and `integrate` passes the worktree; red test green, suite green (215).
