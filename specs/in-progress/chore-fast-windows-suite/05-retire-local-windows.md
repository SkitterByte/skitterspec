---
github_issue_id: "#259"
---

# Phase 5 — Retire the local Windows gate ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `release.js` runs the native and Linux suites only. Windows is CI's,
before staging. Proven by `scripts/release.test.js`.

## Tasks

- [ ] Remove the Windows step and `windowsGate` from `release.js`.
      `--skip-windows` and `SKITTERSPEC_RELEASE_WINDOWS` are accepted and
      ignored for one release, with a one-line note saying Windows now runs
      in CI, so habits and shell profiles don't error.
- [ ] Rewrite RELEASING.md's Windows section around the CI gate, and keep the
      Defender and timing notes as troubleshooting for the VM, which is still
      useful for debugging a Windows-only failure by hand.
- [ ] Tests: no plan carries a Windows step; the old flag and variable give
      the note and change nothing else. Run `pnpm test`, green.
