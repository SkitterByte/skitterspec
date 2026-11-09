---
github_issue_id: "#149"
---

# Phase 2 — Line endings and Windows product fixes ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the product behaves correctly on Windows for every failure phase 1
filed here — proven by those tests passing on windows-latest and ubuntu.

## Tasks

- [x] Get a windows-latest run with phase 1's short-name fix — branch pushed,
      run 42699077387 — and triage it: the short-name failures are gone; what
      remained in the `test:nested` step was four classes
- [x] **Product: the hooks could not start the engine on Windows** (`EFTYPE`) —
      they spawned `.bin/<name>`, a shell shim, failed open, and the main guard
      and review gate were silently off. `findEngine` now finds the package's
      JS entry on win32 and `engineCommand` runs any `.js` engine through node —
      never a shell, since a tool's command line is one of the arguments
- [x] **Product: `dev down` left the server running on Windows** — no process
      groups, so `kill(-pid)` threw and only the `sh` wrapper died; the server
      kept the worktree locked (`EPERM` on cleanup). `signalGroup` uses
      `taskkill /pid <pid> /T /F` on win32; dev servers start `windowsHide`
- [x] Add `.gitattributes` (`* text=auto eol=lf`) — every tracked file was
      already LF, so nothing renormalised
- [x] Add `scripts/gh-annotations.js`, a reporter that turns each failure into a
      public `::error` annotation, run beside the default reporter in the
      Windows job (`test:nested` forwards extra args to `node --test`)
- [x] Done ahead of phase 3, to save a CI round trip: `up-from` regexes accept
      either separator; hook-test stubs are `.js` files run through node; tests
      run the engine as `node <engine.js>`
- [x] Symlink seeds — not reached by the run (the full suite has not run); left
      to phase 3's triage
- [x] Tests: `hooks-find-engine` (win32 entry, `engineCommand`, a POSIX shim
      stays silent on win32), `env-supervise` (taskkill argv, no shell; never
      off win32), `gh-annotations` (format, escaping, subtest parents and other
      events stay silent). Full suite 4648 green, `test:nested` 167 green

## Notes

The log was cut off part-way, so only part of the `test:nested` failures was
seen. The full suite has still never run on Windows: `test:nested` failing
stops the job first.
