---
github_issue_id: "#256"
---

# Phase 1 — Measure, and Defender exclusions ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a ranked per-file timing of the suite on the VM and the Mac, and the
Defender exclusions in place and measured. Proven by the numbers recorded here.

## Tasks

- [ ] Add a timing reporter or script (`scripts/test-timings.js`) that runs
      the suite and ranks test files by wall-clock time, writing JSON.
- [ ] Record the baseline: total time and the top 30 files on the VM, and the
      same on the Mac.
- [ ] Add Defender exclusions in the VM for the clone and the test temp dir
      (`%TEMP%`, or a dedicated `SKITTERSPEC_TEST_TMP`), then re-measure and
      record the change.
- [ ] Document the exclusions in RELEASING.md's Windows section (the
      PowerShell lines, and why), and in the vm-bridge README if that's where
      the VM setup lives.
- [ ] Tests for the timing script's ranking and output. Run `pnpm test`, green.
