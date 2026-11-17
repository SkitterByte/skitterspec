---
github_issue_id: "#227"
---

# Phase 1 — Windows gate in release.js ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a configured Windows command runs as a verify step before the tag,
and an unset one is announced. Unit tests on `windowsGate`, `buildPlan` and
the plan text prove it.

## Tasks

- [x] Add a pure `windowsGate({ command, skip })` beside `linuxGate`, with a
      comment naming what would fool it: a VM whose share is stale, or a
      wrapper that exits 0 on failure.
- [x] Thread `windows` through `buildPlan`, and add the verify step after
      Linux with the same `restore` list.
- [x] Print the skipped note in `formatPlan` for `unknown` and `skipped`.
- [x] Parse `--skip-windows` and add it to the usage text.
- [x] Document the variable, the shared-folder requirement and the flag in
      `RELEASING.md`.
- [x] Tests in `scripts/release.test.js`:
  - [x] gate states
  - [x] step present and ordered after Linux
  - [x] stays silent: unset variable → note, no step, release not refused
  - [x] `--skip-windows` → skipped note
- [x] Run `pnpm test`, green.
