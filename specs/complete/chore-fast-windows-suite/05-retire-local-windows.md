---
github_issue_id: "#259"
---

# Phase 5 — Retire the local Windows gate ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `release.js` runs the native and Linux suites only. Windows is CI's,
before staging. Proven by `scripts/release.test.js`.

## Tasks

- [x] Remove the Windows step and `windowsGate` from `release.js`.
      `--skip-windows` and `SKITTERSPEC_RELEASE_WINDOWS` are accepted and
      ignored for one release, with a one-line note saying Windows now runs
      in CI, so habits and shell profiles don't error.
- [x] Rewrite RELEASING.md's Windows section around the CI gate, and keep the
      Defender and timing notes as troubleshooting for the VM, which is still
      useful for debugging a Windows-only failure by hand.
- [x] Tests: no plan carries a Windows step; the old flag and variable give
      the note and change nothing else. Run `pnpm test`, green.

## Notes

- `windowsGate` became `windowsNote`. It returns the "ignored" line when the
  flag or the variable is given, and `null` otherwise, so a releaser who never
  set either sees nothing about Windows.
- `SKITTERSPEC_RELEASE_WINDOWS` is still exported in the author's `~/.zshrc`.
  It is harmless now, and removing the line silences the note.
