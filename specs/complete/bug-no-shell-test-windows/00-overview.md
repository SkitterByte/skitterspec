---
github_identifier: "#225"
github_url: "https://github.com/SkitterByte/skitterspec/issues/225"
---

# Bug: the no-shell spawn test fails on Windows with Git installed

> **Type:** Bug
> **Name:** bug-no-shell-test-windows (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/225
> **Author:** Reuben Greaves
> **Raised:** 2026-11-17
> **Area:** packages/common/test/env-supervise-no-shell.test.js
> **Severity:** 3 - Medium
> **Docs:** none: test-only change, no reader-visible behaviour

## Summary

`env-supervise-no-shell.test.js` assumes that taking `sh` off `PATH` leaves no
shell to spawn. On a Windows machine with Git for Windows installed, a shell is
still found, so the test fails. It now fakes the failed spawn instead of
relying on what the machine lacks.

## Symptom

Windows CI, after the 2026-11-17 releases:

```
✖ a shell that cannot be spawned is reported, not thrown — and writes no pid file
  AssertionError [ERR_ASSERTION]: true !== false
    at env-supervise-no-shell.test.js:36:10
```

## Root cause

The test sets `env: { PATH: <empty dir> }` and expects `startProcess` to fail.
But `startProcess` merges that into `process.env`
(`packages/common/src/env/supervise.js:122`). On Windows, `resolveShell`
(`supervise.js:83`) also looks under `ProgramFiles\Git\bin\sh.exe`, and GitHub's
Windows runners have Git installed there. So a shell is found, it really starts,
and `started` is `true`. The production code is correct; the test was reading an
absence from the machine. That is the pattern `.claude/rules/negative-checks.md`
warns about, and the same shape as `bug-afterswitch-tests-windows`.

## Failing test (red)

The CI failure above. Reproduced on macOS by giving the same call a `PATH`
where a shell exists (`/bin`), which is the Windows runner's situation:
`startProcess(...)` → `started: true`.

## Fix

- [x] Inject a `spawnImpl` whose child has no pid and emits `ENOENT` on the
      next tick, so the test sets up the failed spawn itself on every platform.
      Keep the same assertions.
- [x] Add a stays-silent check that the fake's `error` event does not escape
      (the property the original bug, `bug-review-serve-spawn-sh`, was about).
- [x] Run `pnpm test`, green. Confirm the test passes with a reachable shell
      on `PATH`.

## Impact

_No external surface changes — internal refactor only._

## Changelog

- 2026-11-17 — Bug reproduced (CI red on Windows; macOS repro with a
  reachable shell).
- 2026-11-17 — Fixed: the test injects a failed spawn instead of emptying PATH; suite green.
- 2026-11-17 — Completed; fix green, suite green (5148).
