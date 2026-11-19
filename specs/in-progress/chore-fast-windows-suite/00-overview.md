---
github_identifier: "#255"
github_url: "https://github.com/SkitterByte/skitterspec/issues/255"
---

# Fast Windows suite, one test pass per release batch

> **Type:** Chore
> **Name:** chore-fast-windows-suite (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/255
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** scripts/release.js, scripts/release.test.js, packages/common/test/helpers/repo.js, packages/*/test/*.test.js (the slowest on Windows), RELEASING.md
> **Stack:** worktree
> **Docs:** none: test and release tooling only, no reader-visible behaviour

## Summary

Get the Windows run of the suite from about 17 minutes to under 5. Make a
multi-package release run its suites once, not once per package. Releasing
all five distributions should cost one test pass, not five.

## Problem

`release.js` runs the native, Linux and Windows suites for every package. A
five-package release ran the same code through the Windows VM five times, at
about 17 minutes each, against about 20 seconds on the Mac. 213 of the 362
test files build throwaway git repos (266 `git init` sites). Each test spawns
`git` and `node`, which is slow on Windows and slower again under Defender's
real-time scanning in a VM. A release that should take minutes took hours.

## Acceptance criteria

- `node scripts/release.js <pkg>,<pkg>,… minor --yes` releases several
  packages with one native, one Linux and one Windows run, then commits and
  tags each one.
- The full suite runs on the Windows VM in under 5 minutes. Before and after
  numbers are recorded in this spec.
- RELEASING.md says how to exclude the VM clone and the test temp dir from
  Defender, and what that bought.
- No test's coverage is lost. Every rewritten test still asserts what it
  asserted, and real-git behaviour (ranges, worktrees, remotes) keeps a
  real-git test.

## Decisions

1. **Measure first.** Phase 1 times every test file on the VM and on the Mac
   and ranks them. Later phases work down that list until the target is met,
   rather than touching all 213 files.
2. **Defender exclusions come before any code.** They're the cheapest lever,
   and measuring them alone shows what is left for code to fix. It's a
   documented machine setup step, not something the repo can enforce.
3. **One test pass per batch, full suite.** The local Windows gate keeps the
   full suite and simply never repeats it. A Windows-relevant subset was
   rejected because it gives up coverage the gate was added to provide.
4. **Copy fixtures, don't rebuild them.** A shared helper builds a file's
   fixture repo once and copies it per test with `fs.cpSync`. That swaps a
   dozen `git` spawns per test for a file copy, and every test still gets a
   repo of its own.
5. **Move planner logic to pure tests, keeping a thin real-git layer.** CLI
   tests over real repos that only check planner logic are rewritten against
   the pure planners (`planUp`, `planResume`, `blockersFrom` …). A real-git
   test stays wherever only git can show the behaviour.
6. **Cache the engine's read-only git calls per process.** On the Mac the suite
   spawns 18,100 subprocesses, and about half are the engine asking git the
   same question again within one command (`rev-parse`, `symbolic-ref`,
   `worktree list`, `status`). A memo around those reads, cleared by any write
   the same process makes, cuts them. Every real command gets faster on
   Windows too, so the commit carries a `Release-Note:` even though the spec
   is a chore.
7. **Out of scope: making CI's Windows job stop a release.** `release.yml` is
   separate from `ci.yml`, and that is its own design question.

## Solution overview

- `release.js` accepts a comma-separated package list. It plans every bump,
  runs the gates once over the tree with all bumps written, then commits and
  tags each package in order, base first. A single package works as today.
- `test/helpers/repo.js` gains `fixture(build)`, which runs `build` once into a
  cached template dir and returns a copier.
- The slowest files from phase 1's ranking move to `fixture()`, then to pure
  tests where they only test planning.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `scripts/release.js <pkg>[,<pkg>…]`: one test pass per batch |
| Service | add | `fixture()` in `packages/common/test/helpers/repo.js` |
| Service | update | engine git reader: per-process memo of read-only calls |
| CLI command | add | `scripts/spawn-census.js` (a `--require` hook) |
| Business rule | update | RELEASING.md: Defender exclusions; batch releases |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Measure, and Defender exclusions | ✅ | [01-measure-and-exclude.md](01-measure-and-exclude.md) |
| 2 | One test pass per release batch | ✅ | [02-batch-release.md](02-batch-release.md) |
| 3 | Fixture copies for the slowest files | ✅ | [03-fixture-copies.md](03-fixture-copies.md) |
| 4 | Cache the engine's repeated git reads | ⬜ | [04-engine-git-cache.md](04-engine-git-cache.md) |
| 5 | Planner logic to pure tests, then confirm the target | ⬜ | [05-pure-tests.md](05-pure-tests.md) |

## Open questions

- None

## Changelog

- 2026-11-19 — Spec created. A five-package release spent hours in the
  Windows VM.
- 2026-11-19 — Follow-up surfaced: Windows failures in CI do not stop a
  release (`release.yml` runs on Ubuntu only). Not in scope here.
- 2026-11-19 — Phase 1: the Windows baseline is 22.7 min, against 42 s on the
  Mac. Defender real-time protection was already off in the VM, so Decision 2's
  lever bought nothing here, and the target now rests on phases 3 and 4. The
  four slowest files account for about a quarter of in-test time.
- 2026-11-19 — Phase 3 measured spawns, not just files. The suite spawns
  18,100 subprocesses on the Mac, and Windows pays about 200 ms for each, so
  spawn count is the cost. Test scaffolding is about 29% of spawns, engine
  re-reads about half, and `node` children are few but expensive. Fixture
  copies alone cannot reach the target, so a new phase 4 caches the engine's
  git reads. Pure tests move to phase 5, and `scripts/spawn-census.js` is
  committed to measure every phase.
- 2026-11-19 — Phase 3 closed after three conversions and a 3.4% suite-wide
  spawn cut. The rest of the scaffold conversions move to phase 5, after the
  engine cache, where the ranking will have changed.
