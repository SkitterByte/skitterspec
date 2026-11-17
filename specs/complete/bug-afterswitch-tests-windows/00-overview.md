---
github_identifier: "#220"
github_url: "https://github.com/SkitterByte/skitterspec/issues/220"
---

# Bug: afterSwitch tests fail on Windows CI

> **Type:** Bug
> **Name:** bug-afterswitch-tests-windows (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/220
> **Raised:** 2026-11-17
> **Area:** packages/common/test/cli-spec-env-live.test.js, packages/common/test/shell-commands-portable.test.js (new)
> **Docs:** none: test-only change, no reader-visible behaviour

## Summary

Three `live.afterSwitch` tests pass on macOS and Linux and fail in the Windows
CI job, because they hand the engine Unix-only shell commands. They now use
portable `node -e` commands, and a new guard test fails on any platform if a
test hands the engine a Unix-only command again.

## Symptom

The Windows CI job (`ci.yml`, `windows-latest`) failed after the 23.15.0
release push:

```
✖ live take runs a matched afterSwitch command in the primary, and skips the rest
  ! after switch: mkdir -p .spec-env && echo "$(git branch --show-current)" >> .spec-env/ran.log failed (exit 1)
      A subdirectory or file .spec-env already exists.
✖ live take stops at a failing afterSwitch command and leaves the switch standing
    ran:  echo boom-output; exit 3
✖ live release runs afterSwitch against the same files, after switching back
      A subdirectory or file -p already exists.
```

`release.js` runs the suite natively and on Linux, never on Windows, so
nothing caught it before the tags were cut.

## Root cause

`packages/common/src/env/live.js:577` spawns each afterSwitch command with
`shell: true`, which is `cmd.exe` on Windows. The tests from `d2e25b39`
(`cli-spec-env-live.test.js:744, 761, 778`) are written for a Unix shell:
`mkdir -p` (cmd creates a directory called `-p`), `$(…)` command substitution
(cmd does not have it), and `; exit 3` (cmd ignores `;`, so the command
succeeds). The engine is correct; the tests are not portable.

## Failing test (red)

`packages/common/test/shell-commands-portable.test.js` — no test may hand a
command to a key the engine runs through the platform shell (`run:`,
`afterSwitch`, `afterLand`, `setup`, `releaseWith`) using `mkdir -p`, `$(…)` or
`; exit N`. Reviewer commands are out of scope: `reviewers.js` runs them
through `sh` on every platform. Run with
`node --test packages/common/test/shell-commands-portable.test.js`. Red on
macOS, naming exactly the three tests:

```
✖ no test hands the engine a shell command only sh understands
    common/test/cli-spec-env-live.test.js:744: `mkdir -p` …
    common/test/cli-spec-env-live.test.js:761: `; exit N` …
    common/test/cli-spec-env-live.test.js:778: `mkdir -p` …
```

## Fix

- [x] Rewrite the three tests' commands as `node -e "…"` (single quotes
      inside), matching the existing portable form, and update the assertions
      that quote the command text.
- [x] Guard test green; the full suite green.
- [x] Follow-up hardening: none here. Making `release.js` require CI to have
      passed on the pushed base is a separate spec.

## Impact

_No external surface changes — internal refactor only._

## Changelog

- 2026-11-17 — Bug reproduced; failing test added (red).
- 2026-11-17 — Guard scoped to engine-shell keys after it also flagged the
  reviewer tests. Those are correct as sh: reviewers run under `sh`
  everywhere.
- 2026-11-17 — Fixed: the three tests use `node -e` commands; guard green,
  suite green (5130 passed).
- 2026-11-17 — Completed; all phases done, tests green.
