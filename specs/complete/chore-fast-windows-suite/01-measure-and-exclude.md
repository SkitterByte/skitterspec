---
github_issue_id: "#256"
---

# Phase 1 — Measure, and Defender exclusions ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a ranked per-file timing of the suite on the VM and the Mac, and the
Defender exclusions in place and measured. Proven by the numbers recorded here.

## Tasks

- [x] Add a timing reporter or script (`scripts/suite-timings.js`) that runs
      the suite and ranks test files by wall-clock time, writing JSON.
- [x] Record the baseline: total time and the top 30 files on the VM, and the
      same on the Mac.
- [x] Add Defender exclusions in the VM for the clone and the test temp dir
      (`%TEMP%`, or a dedicated `SKITTERSPEC_TEST_TMP`), then re-measure and
      record the change.
- [x] Document the exclusions in RELEASING.md's Windows section (the
      PowerShell lines, and why), and in the vm-bridge README if that's where
      the VM setup lives.
- [x] Tests for the timing script's ranking and output. Run `pnpm test`, green.

## Notes

Baseline, 2026-11-19, at `8ef8af76`:

| | Mac | Windows VM |
|---|---|---|
| Wall clock | 42 s | 1364 s (22.7 min) |
| Summed inside tests | 511 s, 367 files | 3951 s, 366 files |

Top of the Windows ranking (the same four files lead on the Mac):

| File | Windows | Mac |
|------|---------|-----|
| `cli-spec-env-integrate` | 263 s | 21 s |
| `cli-spec-env-live` | 259 s | 22 s |
| `cli-spec-env-hotfix-land` | 251 s | 20 s |
| `env-review-reader` | 245 s | 25 s |
| `cli-spec-env-rolling-base` | 109 s | 15 s |
| `env-base` | 87 s | 13 s |

The top four are a quarter of all in-test time on Windows. The Mac's `sys`
time (157 s against 107 s `user`) is process creation, which Windows does
far more slowly.

**Defender was not the cost.** Real-time protection was already off in this VM
(`RealTimeProtectionEnabled: False`), so there was nothing to re-measure. The
exclusions were added anyway (as SYSTEM through `prlctl exec`; `vm` runs
unelevated), and RELEASING.md now says to check this first. The vm-bridge
README is another project, so it is left to that repo.

The reporter is `suite-timings.js`, not `test-timings.js`: `node --test`'s
default glob runs every `test-*.js` as a test file, and the first name failed
the suite that way.
