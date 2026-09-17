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

1. **The one failing test is already fixed and is not in scope here.** It waits
   on `portsInUseOn` — the probe the product itself decides with — rather than a
   timer. This spec is about the class, not that instance.
2. **REJECTED: adding `macos-latest` to the CI matrix.** It was this spec's
   leading candidate and it would not have prevented anything. `ci.yml` already
   runs `on: push` against `ubuntu-latest`, so a Linux leg exists and **it is what caught the bug**
   — the ubuntu job went red exactly as it should. Adding macOS would catch the
   *inverse* (Linux-green, macOS-red), which is the direction that only ever
   inconveniences the developer at their own keyboard. Cost was not the reason
   to reject it: the repo is public, so Actions minutes are free, macOS
   included. It is rejected for being aimed at the wrong failure.
3. **The gap is WHEN the tag is cut, not WHERE the suite runs.**
   `scripts/release.js` runs `pnpm test` on the releaser's own machine and then
   tags. That local run is macOS; the tag is then pushed and CI discovers on
   Linux what the tag has already asserted. The recovery we performed by hand —
   push the commit, wait for `ci.yml` to go green, *then* tag — is the fix, and
   it should not depend on someone remembering it.
4. **A local Linux run is viable, and is proven rather than assumed.** Docker is
   present and the full reader suite runs **42/42 on `node:22`** in a container
   against this worktree. That is also how the group-kill fix was first confirmed
   on Linux at all. It takes ~111s against ~22s natively — slower, and still far
   cheaper than a release round-trip.
5. **This is the second instance in three days, and the first was a product bug, not a test bug.**
   `bug-probe-race-on-linux` — completed 15 Sep — opens *"Five tests fail on CI and all five pass on macOS"*,
   with the same `file://` fallback symptom. A local Linux gate would have
   caught that one before it was ever pushed, which a release-time gate would
   not. That is the argument for doing both.
6. **The audit found no surviving instance of the defect itself.** Across all
   eight port-touching files there is exactly **zero** remaining site that kills
   a supervised process by its recorded pid alone, or stops one and asserts
   without waiting. What it did find is a **second tier**: five sites where
   `stopProcess` waits on `isAlive(leaderPid)` rather than on the socket, so on
   Linux a reaped `sh` leader can leave its node child still closing a listener
   that the very next line re-binds.

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
| 1 | Decide the approach, and audit the port-touching tests | ✅ | [01-audit-and-decide.md](01-audit-and-decide.md) |
| 2 | Gate the tag on Linux, and close the second tier | ✅ | [02-apply.md](02-apply.md) |

## Open questions

- [x] ~~Is doubling CI minutes worth catching this class?~~ Moot — the repo is
      public, so Actions minutes are free, and the matrix is rejected on grounds
      of aim rather than cost (Decision 2).
- [x] ~~Do any of the other seven files have the same race?~~ No. Zero surviving
      sites; five second-tier ones, carried into phase 2.
- [x] ~~Should `stopProcess` itself wait for the port, or should its callers?~~
      The callers. `stopProcess` is generic and knows no port, so teaching it to
      wait would mean inventing one it has no business knowing.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-17 | Ready | backlog | Reuben Greaves |
| 2026-09-17 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-17 — Spec created, from two release workflows failing on a test that
  was green locally.
- 2026-09-17 — Phase 1 reversed this spec's own leading candidate. A CI matrix
  would not have caught the incident: `ci.yml` already runs ubuntu on every
  push and its ubuntu leg is what went red. The gap is that `release.js` tags
  off a local macOS run and never consults that result.
- 2026-09-17 — Phase 1: the audit found zero surviving defect sites and five
  second-tier ones, where `stopProcess` waits on the leader pid rather than on
  the socket. Also a landmine: the teardown test writes the runner's own pid
  into a pidfile, safe only while nothing on that path calls `stopProcess`.
- 2026-09-17 — Phase 1: a local Linux run was proven, not assumed — the reader
  suite runs 42/42 on `node:22` in Docker against this worktree, which is also
  how the group-kill fix was first confirmed on Linux.
- 2026-09-17 — Phase 2: a CI lookup before tagging is structurally impossible —
  the sha being tagged is created by `release.js` itself, so no run for it can
  exist yet. The gate runs the suite in a container against the exact tree
  instead, which proves the same property without restructuring the flow.
- 2026-09-17 — Phase 2: the gate's first version accused healthy code. Without
  `--init` a container reaps no orphans, so a killed `sh` stays a zombie and
  two teardown tests failed there while passing on macOS and CI. `--init` is
  load-bearing and has its own test — a gate that cries wolf gets skipped.
