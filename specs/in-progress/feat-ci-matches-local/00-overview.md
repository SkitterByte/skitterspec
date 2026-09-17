# Local green should predict CI green

> **Type:** Feature
> **Name:** feat-ci-matches-local (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-17)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-17
> **Area:** .github/workflows/ci.yml, packages/common/test/env-review-reader.test.js, packages/common/test/env-proxy.test.js, packages/common/test/env-serve-start-proof.test.js, packages/common/test/env-review-server-teardown.test.js, packages/common/test/cli-review-serve-port.test.js, packages/common/test/env-review-tiers.test.js, packages/common/test/env-supervise.test.js, RELEASING.md
> **Stack:** worktree

## Problem

`ci.yml` runs on `ubuntu-latest` only, and this project is developed on macOS.
So the suite a person runs before releasing and the suite that gates the release
are on different operating systems, and nothing local can catch a test whose
result depends on which one it is.

It has already cost two release workflows. `env-review-reader.test.js`'s
"a server dying leaves the URL unchanged" `SIGKILL`s the review server and
re-renders immediately. `SIGKILL` returns when the signal is **delivered**, not
when the process has died and released its listening socket — so the next
render's port probe finds the port still held, returns `error: 'busy'`, and
falls back to a `file://` page. The assertion then reads `null` and blames the
URL-stability logic for a race in its own setup. macOS releases the socket
inside that gap; the Linux runner does not.

That is the worst shape a test can have: **green where it is written, red where it is trusted**.
`skitterspec@22.0.0` and `skitterspec-linear@17.0.0` were both cut with a green
local suite, pushed, and failed in CI — the tags had to be deleted and
re-pushed.

The one test is fixed (`3b06b49`). What is not fixed is that the same class can
reach a release again tomorrow, from any of the eight test files that bind or
kill ports, and that nobody running `pnpm test` has reason to doubt the result.

## Decisions

Only one is settled; the rest are the point of the spec.

1. **The one failing test is already fixed and is not in scope here.** It waits
   on `portsInUseOn` — the probe the product itself decides with — rather than a
   timer. This spec is about the class, not that instance.

## Solution overview

Three candidate directions, to be grilled before any code:

- **Widen CI to a platform matrix** (`ubuntu-latest` + `macos-latest`). Catches
  this class in both directions, including the inverse — Linux-green,
  macOS-red — which nothing catches today. Costs roughly double the CI minutes
  on every push, on a repo where the suite is ~22s.
- **Audit the port-touching tests** for the same shape: anything that kills or
  closes a listener and then immediately asserts on a re-bind. Eight files use
  `process.kill`, `listen(` or `freePort`. A shared `waitPortReleased`-style
  helper would give them one correct way to wait.
- **Make the release step honest about what it proves.** `release.js` runs the
  suite before tagging and that is genuinely valuable — it caught a real bug the
  same day. But a green local run is not evidence about Linux, and neither the
  tool's output nor `RELEASING.md` says so.

These are not exclusive. The grill should decide which combination is worth it,
and explicitly whether doubling CI minutes is.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CI config | update | `ci.yml` — possible `os` matrix |
| Test helper | add | a shared wait-for-port-released, replacing per-file ad hoc waits |
| Docs | update | `RELEASING.md` — what a green local suite does and does not prove |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Decide the approach, and audit the port-touching tests | ⬜ | [01-audit-and-decide.md](01-audit-and-decide.md) |
| 2 | Apply it — matrix, shared helper, or both | ⬜ | [02-apply.md](02-apply.md) |

## Open questions

- [ ] Is doubling CI minutes worth catching this class, given the suite is ~22s?
- [ ] Do any of the other seven port-touching files already have the same race,
      or did this one differ in kicking the process rather than stopping it?

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-17 | Ready | backlog | Reuben Greaves |
| 2026-09-17 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-17 — Spec created, from two release workflows failing on a test that
  was green locally.
