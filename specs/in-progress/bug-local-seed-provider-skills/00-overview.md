---
github_identifier: "#340"
github_url: "https://github.com/SkitterByte/skitterspec/issues/340"
---

# Bug: bootstrap does not seed a provider's skills into a local install's worktree

> **Type:** Bug
> **Name:** bug-local-seed-provider-skills
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/340
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Area:** `packages/common/src/init.js` (`localSeedFiles`)
> **Docs:** reference

## Symptom

Reported from ereqs (base `@skitterbyte/skitterspec` 24.0.0, provider
`@skitterbyte/skitterspec-azure-boards` 4.0.0, `init --local`):

> `spec-env bootstrap` does not seed a provider's managed skills into a
> worktree of an `init --local` install.

`localSeedFiles(process.cwd())` from the global base package returns 44 seeds
and none of `.claude/skills/spec-push`, `spec-status`, `spec-sync`,
`spec-claim`, `spec-list` or `spec-azure-setup`; `bootstrap --plan` lists 20
skill seeds and none of the six. Four of 21 ereqs worktrees lacked them,
worked around by symlinking the six folders by hand.

## Root cause

The skills call the bare `skitterspec` binary, which is the **base** package.
`localSeedFiles` (`packages/common/src/init.js`) built its list from
`localManagedPaths` → `managedTargets`, which enumerates the running
distribution's own `ASSETS`. The provider's distribution has its own copy with
its own assets, but it is not the one that runs. The manifest
(`specs/.core/.skitterspec-manifest.json`) records every path the installing
distribution manages, provider skills included, and was ignored.

## Failing test (red)

`packages/common/test/init-local.test.js`:

- `localSeedFiles seeds every skill the manifest records, whichever package
  owns it`: a local install whose manifest names the provider and records
  `spec-push` (present) and `spec-gone` (stale). Asserts `spec-push` is seeded
  into a new worktree, and the stale entry is skipped with
  `not in the root checkout`, with the bootstrap still `ok`.
- `a base-only local install seeds exactly its managed set`: stays-silent case.

Run `node --test packages/common/test/init-local.test.js`. Red:

```
AssertionError [ERR_ASSERTION]: the provider skill is seeded as its folder
```

## Fix

- [x] `localSeedFiles` unions the base managed paths with every path the
      manifest records, skill files collapsed to their folder. The manifest is
      the positive signal. A stale entry falls to `runSeed`'s existing
      `not in the root checkout — skipped`.
- [x] Failing test now passes (GREEN); `pnpm build` and `pnpm test`: 4719
      passed, 0 failed, 1 skipped.
- [x] `docs/reference.html`: the `init --local` row says bootstrap seeds every
      recorded path; stamped.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env bootstrap` seeds a local install's manifest-recorded paths |

## Changelog

- 2026-11-27 — Bug reproduced; failing test added (red).
- 2026-11-27 — Fixed: `localSeedFiles` reads the manifest's records as well as
  the base asset list; test green.
