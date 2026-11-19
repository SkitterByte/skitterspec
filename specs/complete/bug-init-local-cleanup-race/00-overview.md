---
github_identifier: "#261"
github_url: "https://github.com/SkitterByte/skitterspec/issues/261"
---

# Bug: init-local tests race git's background housekeeping

> **Type:** Bug
> **Name:** bug-init-local-cleanup-race (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/261
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** packages/common/test/init-local.test.js
> **Severity:** 4 - Low
> **Docs:** none: test-only fix, no reader-visible behaviour

## Summary

Two to four `init-local` tests failed most full suite runs with `ENOTEMPTY`
while deleting their temp repo, and never when the file ran alone. The test
fixture now turns off git's background housekeeping, which was still writing
into the repo as it was deleted.

## Symptom

On `main` at `0eeebd2a`, `pnpm test` failed 2–5 tests on each of five runs,
always in `packages/common/test/init-local.test.js`'s `cleanup()`:

```
Error: ENOTEMPTY, Directory not empty: '…/T/skitterspec-local-GHWBSm'
    at cleanup (packages/common/test/init-local.test.js:51:6)
```

The failing tests varied between runs (`a customized managed file survives
conversion…`, `a markerless Spec workflow section…`, `foreign hooks stay…`).
All of them commit a team install, then convert it. The file passes alone, and
passed 24 runs in parallel.

## Root cause

`git commit` can start git's housekeeping (`gc --auto`, `maintenance run
--auto`) as a **detached** process. Whether it does is git's estimate of the
loose-object count, made by sampling one fan-out folder (`objects/17`), so a
commit of a whole install sometimes crosses the threshold and sometimes doesn't.
The detached process goes on writing `.git/objects/info/packs` (and
`.git/info/refs`) after the test has moved on to `fs.rmSync`, and the delete
fails on a folder that gained a file mid-delete. An instrumented run caught
exactly those files left behind, with no process still holding the folder.
`repo()` (`init-local.test.js:19`) built the fixture with git's defaults.

## Failing test (red)

`the fixture repo never starts git's background housekeeping` in
`packages/common/test/init-local.test.js`. It asserts the fixture repo has
`gc.auto=0` and `maintenance.auto=false`. Run it with
`node --test packages/common/test/init-local.test.js`. Red:

```
✖ the fixture repo never starts git's background housekeeping
  Error: Command failed: git -C …/skitterspec-local-XTCuID config --get gc.auto
```

## Fix

- [x] Set `gc.auto 0` and `maintenance.auto false` in `repo()`, so no commit in
      these tests starts a detached writer.
- [x] Failing test now passes (GREEN); run `pnpm test` three times with no
      `init-local` failure.
- [x] None further. `test/helpers/repo.js` deletes with retries and its
      fixtures commit little, so it has not shown this. A wider sweep is not
      worth it until another file does.

## Impact

_No external surface changes — internal refactor only._

## Changelog

- 2026-11-19 — Bug reproduced; failing test added (red). Root cause found by
  an instrumented cleanup under full-suite load.
- 2026-11-19 — Fixed: `repo()` sets `gc.auto 0` and `maintenance.auto false`; test green, and three full `pnpm test` runs had no failures (each had 2–5 before).
- 2026-11-19 — Completed; fix done, tests green.
