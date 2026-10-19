---
linear_identifier: "SKS-389"
linear_url: "https://linear.app/skitterbyte/issue/SKS-389/bug-build-dist-tests-rebuild-the-real-distributions-mid-suite"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: build-dist tests rebuild the real distributions mid-suite

> **Type:** Bug
> **Name:** bug-build-dist-test-race (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-19)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-18
> **Area:** scripts/build-dist.js, scripts/build-dist.test.js

## Symptom

`pnpm test` fails now and then on `packages/common/test/assets-review.test.js`
and passes on a re-run. It failed the `skitterspec-linear@17.4.0` release's
suite on a healthy tree:

```
✖ every distribution ships the template, not just the source package
  AssertionError [ERR_ASSERTION]: skitterspec ships assets/review/page.html
```

Repro: run `scripts/build-dist.test.js` in a loop while running
`assets-review.test.js` repeatedly. 1 of 30 runs failed.

## Root cause

`node --test` runs every test file in its own process, at the same time.
`scripts/build-dist.test.js` called `buildBase()` / `buildLinear()` 23 times,
and both always built into `packages/skitterspec{,-linear}/` itself
(`scripts/build-dist.js:179`, `:197`). That deletes `assets/`, `bin/` and
`src/` there and writes them again. Meanwhile
`assets-review.test.js:66` checks that `assets/` exists and then reads
`assets/review/page.html`. It saw the folder before the file was rewritten.
Any other test that reads a built distribution could hit the same race.

## Failing test (red)

In `scripts/build-dist.test.js`:

- `a build given an output directory writes there and leaves the real
  distribution alone`. It checks that a build writes to the directory it was
  given and that the real `assets/` keeps its inode, meaning it was never
  deleted and re-created. Red: `skitterspec returns the directory it was given`.
- `no test in this file builds into the real checkout`. Red: it found
  `buildBase()` / `buildLinear()` called with no output directory.

Run: `node --test scripts/build-dist.test.js`.

## Fix

- [x] `buildBase(out)` / `buildLinear(out)` take an output directory. It
      defaults to the package itself, so `prepare` and releases are unchanged.
- [x] Every build in `build-dist.test.js` goes through `builtBase()` /
      `builtLinear()`. These build into a temp directory and copy the
      dist's `package.json` in.
- [x] Failing tests now pass. The race repro is clean: 30 of 30, and the
      real `assets/` inode is unchanged. `pnpm test` is green: 3586.

## Impact

_No external surface changes — internal refactor only._

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-18 | In Progress | in-progress | Reuben Greaves |
| 2026-10-19 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-18 — Bug reproduced (1/30 under the race); failing tests added (red).
- 2026-10-18 — Fixed: builds take an output directory, and the tests use
  temp directories; tests green.
- 2026-10-18 — Follow-up surfaced: `env-supervise.test.js:56` failed once
  in 9 full-suite runs. Its health check timed out after 5.1s under load. It
  is a separate timing flake, not in scope here.
- 2026-10-19 — Completed; all phases done, tests green.
