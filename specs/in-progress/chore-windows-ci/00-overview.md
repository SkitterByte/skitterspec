---
github_identifier: "#147"
github_url: "https://github.com/SkitterByte/skitterspec/issues/147"
---

# A green, blocking Windows CI job

> **Type:** Chore
> **Name:** chore-windows-ci (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/147
> **Author:** Reuben Greaves
> **Raised:** 2026-11-09
> **Area:** .github/workflows/ci.yml, .gitattributes (new), packages/common/src/env/{supervise,bootstrap,review,reviewers,serve,hotfixland}.js, packages/*/test
> **Stack:** worktree
> **Docs:** none: CI and Windows fixes; no reader-visible behaviour on the documented platforms

## Summary

The full test suite passes on Windows and the windows-latest CI job blocks the
build, so a change that breaks Windows — where skitterspec's first
subfolder-project adopter works — is caught before it ships.

## Problem

`feat-subfolder-project` added a windows-latest job where only `test:nested`
gates; the full suite runs with `continue-on-error` because it has never run on
Windows. Until it is green and blocking, a Windows regression is invisible. A
static scan already shows product code that cannot work there as written —
dev-server stop kills a process group by negative pid, `sh` spawns, `/dev/null`
diffs, symlink seeds — and the repo has no `.gitattributes`, so a Windows
checkout gets CRLF and every test reading a file against `\n` will fail.

## Acceptance criteria

- The windows-latest job runs `pnpm test` and `pnpm test:nested` with no
  `continue-on-error`, and both are green.
- Every test skipped on Windows names why the feature does not apply there.
- Windows product bugs the run exposed are fixed, each with a Release-Note.
- ubuntu results are unchanged.

## Decisions

1. **CI green, and fix what it finds.** A failing test that exposes real
   Windows behaviour is fixed in the product, not skipped — the adopter is on
   Windows. Rejected: tests-only (hides real bugs behind skips) and a full
   Windows audit (open-ended).
2. **Skips are the exception, and named.** A test skips on `win32` only where
   the feature genuinely does not apply, with the reason in the skip message;
   no blanket skips per file.
3. **Git Bash is the shell.** Claude Code on Windows runs commands in Git Bash
   and Git for Windows ships `sh`, so spawning `sh` stays allowed and printed
   commands stay POSIX-shaped. Rejected: native cmd/PowerShell support.
4. **Triage from a real run.** The failure list exists only once the job runs,
   so phase 1 runs it and writes the categories into phases 2–3 as tasks,
   rather than planning from the static scan alone.
5. **Line endings are pinned to LF** with `.gitattributes` (`* text=auto
   eol=lf`), not by teaching tests to accept CRLF.
6. **Commits are `chore`/`ci`/`test` by default; a Windows product fix is
   `fix(...)` with a Release-Note**, overriding the chore default — a Windows
   user would notice it.

## Solution overview

Push, read the windows-latest run, and sort every failure into: line endings,
product (process control, shell, symlinks, paths), and test-only assumptions
(`/tmp`, chmod, POSIX signals, path separators in assertions). Fix product
first so test fixes are not written against broken behaviour, then the tests,
then make the job blocking.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CI | update | windows-latest job: drop `continue-on-error` |
| Config key | add | `.gitattributes` — `* text=auto eol=lf` |
| Service | update | Windows paths in supervise (process stop), bootstrap (seeds), review/reviewers/serve/hotfixland (spawns) — per triage |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Run the Windows job and triage its failures | ✅ | [01-triage.md](01-triage.md) |
| 2 | Line endings and Windows product fixes | ⬜ | [02-product-fixes.md](02-product-fixes.md) |
| 3 | Test-only Windows assumptions | ⬜ | [03-test-fixes.md](03-test-fixes.md) |
| 4 | Make the Windows job blocking | ⬜ | [04-blocking.md](04-blocking.md) |

## Open questions

- None

## Changelog

- 2026-11-09 — Spec created from `feat-subfolder-project`'s follow-up.
- 2026-11-09 — Phase 1: the first run (42694773088) failed `test:nested` with
  one class throughout — the 8.3 short temp path on the runner defeated the
  project find-up. Fixed in phase 1 (`realpathSync.native`) because nothing
  past it was visible; the rest of the triage moves to phase 2's first task.
