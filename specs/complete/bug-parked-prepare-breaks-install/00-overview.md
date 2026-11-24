---
github_identifier: "#314"
github_url: "https://github.com/SkitterByte/skitterspec/issues/314"
---

# Bug: a parked distribution's `prepare` breaks every `pnpm install`

> **Type:** Bug
> **Name:** bug-parked-prepare-breaks-install (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/314
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** scripts/build-dist.js
> **Docs:** none: repo build tooling only, no reader-visible behaviour

## Symptom

`pnpm install` in this repo fails since `chore-park-linear-jira`:

```
packages/skitterspec-jira prepare: Error: build-dist: "skitterspec-jira" is parked — not built, released or tested
ERR_PNPM_EXECUTOR_LIFECYCLE_SCRIPT_FAILED
```

It broke a fresh worktree's install, `pnpm test` (which installs first when a
`package.json` changed), and so `scripts/release.js --yes`, which bumps a
version and then runs the suite. CI's install on a release tag fails the same
way, so nothing can be released.

## Root cause

`packages/skitterspec-{jira,linear}/package.json` keep
`"prepare": "node ../../scripts/build-dist.js <dist>"`, and pnpm runs every
workspace package's `prepare` on install. `buildDist` in
`scripts/build-dist.js` throws for a parked dist, and the CLI entry
propagates it as exit 1.

## Failing test (red)

`scripts/build-dist.test.js` — per parked dist: `build-dist.js <dist>` under
`npm_lifecycle_event=prepare` must exit 0, say it is parked and build nothing;
under `prepack` it must still refuse.

```
✖ a parked skitterspec-linear skips its build on prepare, exiting 0
✖ a parked skitterspec-jira skips its build on prepare, exiting 0
```

## Fix

- [x] CLI entry of `scripts/build-dist.js`: a parked dist under `prepare`
      prints a skip and exits 0; `prepack` and direct calls still refuse
- [x] Failing tests now pass (GREEN); `pnpm install` and `pnpm test` green
- [x] None further

## Impact

_No external surface changes — internal refactor only._

## Changelog

- 2026-11-24 — Bug reproduced; failing test added (red).
- 2026-11-24 — Fixed: parked dists skip their build on `prepare`; test green.
- 2026-11-24 — Completed; fix done, tests green.
