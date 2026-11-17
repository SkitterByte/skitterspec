---
github_identifier: "#221"
github_url: "https://github.com/SkitterByte/skitterspec/issues/221"
---

# Bug: review server crashes with `spawn sh ENOENT` on Windows without sh on PATH

> **Type:** Bug
> **Name:** bug-review-serve-spawn-sh
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/221
> **Author:** Reuben Greaves
> **Raised:** 2026-11-17
> **Area:** packages/common/src/env/supervise.js, packages/common/src/cli.js (serveProcFor, proxyProcFor, DAEMON_LOCATIONS, ensureReviewServer), packages/common/src/env/reviewers.js
> **Docs:** none: no docs page describes how the daemon is spawned

## Symptom

Run from a Mac host through `vm` (`prlctl exec` → `cmd /c`, a PATH without
Git's `bin` or `usr\bin`), any command that has to START the review server dies
with an unhandled `'error'` event:

```
Error: spawn sh ENOENT … syscall: 'spawn sh',
spawnargs: ['-c', 'node ".../src/env/serve.js" ".../.spec-env/review-serve.json"']
```

Seen on `@skitterbyte/skitterspec-azure-boards` 2.12.0, Node v22.22.3, Windows
11 ARM, Git for Windows installed but not on that PATH. The page's tiers then
point at a server that is not running. Through Git Bash the same command works.

Second symptom: a worktree's own engine copy, run while a server started by the
primary checkout's copy is up, called that server stale (the recorded `script`
path and mtime differ), stopped it, then failed to respawn (the ENOENT above) —
every review link went down mid-review.

Also seen once, cause unknown: a server started from Git Bash died between two
renders ~10 minutes apart with no engine call that should have touched it.

## Root cause

1. `startProcess` (`packages/common/src/env/supervise.js:91`) spawned `sh`
   unconditionally with no `'error'` listener. With no `sh`, the spawn returns a
   pid-less child, writes `undefined` to the pid file, and the ENOENT arrives
   next tick as an unhandled event that kills the CLI — after
   `ensureReviewServer` had already stopped the old server. The review server
   and proxy never needed a shell: they are `node <script> <file>`.
2. `DAEMON_LOCATIONS` (`packages/common/src/cli.js`) named only
   `node_modules/@skitterbyte/skitterspec`. In a project that installed a
   superset (here azure-boards), `daemonScript` fell through to `__dirname` —
   the running copy — so primary and worktree engines disagreed about the
   script, and the adoption check read the primary's server as stale.

## Failing test (red)

`packages/common/test/env-supervise-no-shell.test.js` — run with
`node --test packages/common/test/env-supervise-no-shell.test.js`.

- a `command` proc whose PATH has no `sh` is reported (`started: false`,
  `error`), not thrown, and writes no pid file — red: `Error: spawn sh ENOENT`
  crashed the runner
- `serveProcFor` carries `argv: [process.execPath, script, settingsFile]` — red:
  no `argv`
- `resolveShell` finds Git's `sh.exe` off PATH on win32, and answers null when
  there is none — red: `resolveShell is not a function`
- `daemonScript` finds a superset distribution's copy under the root — red:
  returned the running copy

## Fix

- [x] `startProcess` spawns a proc's `argv` directly when it has one; otherwise
      through `resolveShell`. A missing shell or a failed spawn returns
      `{ started: false, pid: null, error }`, with an `'error'` listener and no
      pid file
- [x] `resolveShell`: POSIX `sh` as before; win32 PATH, then Git's install
      locations, then the `bin` beside a `git.exe` on PATH, else null
- [x] `serveProcFor` / `proxyProcFor` carry `argv` (node itself, no shell)
- [x] `DAEMON_LOCATIONS` lists every distribution
- [x] `ensureReviewServer`, `review serve` and `dev up` report a start error
      instead of a pid-less success; reviewers use `resolveShell` on win32
- [x] Failing test now passes (GREEN); `pnpm test` — 5136 passed

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review` / `review serve` start the daemon without `sh`; report a start failure |
| CLI command | update | `spec-env dev up` reports a dev process it could not start |
| Service | update | review server adoption recognises superset installs' daemon copy |

## Changelog

- 2026-11-17 — Bug reproduced; failing test added (red).
- 2026-11-17 — Fixed: daemon and proxy spawn node directly, spawn failures are
  reported, Git's sh found off PATH, every distribution's daemon recognised;
  test green.
- 2026-11-17 — Follow-up surfaced: `provider-kit/src/credentials.js`
  `spawnSync('sh', …)` still needs `sh` on PATH on Windows; it fails cleanly
  (returns the error), so not in scope here. The Git Bash server that died
  after ~10 minutes is unexplained; the `sh` wrapper it ran under is gone now,
  so it may not recur.
- 2026-11-17 — Completed; fix done, tests green. Docs impact flagged index, reference, review for re-read; none describe the spawn path.
