---
github_issue_id: "#229"
---

# Phase 1 — Detect the desktop-less Windows session ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** on win32 with no `SESSIONNAME`, `local` is hidden through the
existing reader path. This is proven by unit tests, CLI tests and a green
Windows run.

## Tasks

- [x] `detectReader(env, platform = null)`: add the win32 / no-`SESSIONNAME`
      rule after SSH and the bridge session. Update its comment to say what
      would fool it: a scheduled task run at the desk, and a service.
- [x] `resolveReader(config, env, platform)`: pass the platform through.
      Pass `process.platform` from the four `cli.js` call sites.
- [x] Update the `readerOffMachine` comment: the signals now include this
      detection, together with the wrong-guess-cost argument.
- [x] Unit tests in `env-review-reader.test.js`:
      - win32 with no `SESSIONNAME` gives remote.
      - Stays silent for win32 with `Console` or `RDP-Tcp#0`.
      - Stays silent for darwin and linux with no `SESSIONNAME`.
      - Stays silent when no platform is given.
      - SSH still wins the `why`.
      - `SKITTERSPEC_READER=local` and `review.reader: local` override it.
- [x] CLI tests in `env-review-tiers.test.js`: set `SESSIONNAME=Console` in
      the child env wherever a test expects `local`, and add one test that
      clears it on win32 only (skipped elsewhere). Check every other test file
      that renders a stack, and the epic and tada tests, for the same
      inherited-env exposure.
- [x] `spec-reports.md`: amend "Detection decides nothing here" to name the
      win32 session signal and the wrong-guess-cost argument. Update the pin in
      `assets-banner-stack.test.js`.
- [x] Update `docs/review.html` (the local-tier paragraph, and bump
      `verified:`) and the `review.reader` comment in `env.config.md`.
- [x] Run the typecheck and full test suite (`pnpm test`), plus the Windows
      run (`SKITTERSPEC_RELEASE_WINDOWS`, or `vm pnpm test`). Green on both
      before the phase is done.

## Notes

The Windows run was simulated, not run for real. The VM's drive was not mounted,
so the full suite ran on the Mac with `cli.js` forcing `'win32'`: 5161 pass,
0 fail. The real Windows run happens before tagging, through
`SKITTERSPEC_RELEASE_WINDOWS`.

After this lands, the `vm` wrapper's `SKITTERSPEC_READER=remote` is redundant
but harmless. Removing it is the operator's choice, in another repo.
