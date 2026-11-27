---
github_issue_id: "#347"
---

# Phase 2 — Restore on release, abort and integrate, plus `live restore` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every way of handing the workbench back restores the snapshot, a
failed restore is kept and retried, and the docs describe the snapshot reach.
Tests prove each path.

## Tasks

- [ ] `planRelease` and `planAbort`: when the receipt carries a `snapshot`,
      return a restore step after the checkout and before `afterSwitch`.
- [ ] `cli.js` release and abort: run the restore with `SPEC_ENV_SNAPSHOT`.
      On exit 0, delete the snapshot and clear the receipt. On failure, keep
      the switch, keep the file, write `.spec-env/live-restore.json`, and
      print the tail and `spec-env live restore`.
- [ ] Make the live-aware end in `integrate` restore the same way before it
      lands.
- [ ] Add `spec-env live restore`, which retries a pending restore and is a
      no-op with nothing pending. Make `live status` warn while a restore is
      pending, and treat an unreadable record as pending.
- [ ] Docs: `core/env.config.md` (the `snapshot`, `restore` and reach values),
      `commands/spec-live.md`, `skills/spec-start/isolation.md`, the
      reach-naming `Next` in `skills/spec-next/SKILL.md`, and
      `docs/reference.html`. Then run
      `node scripts/docs-freshness.js verify reference`.
- [ ] Tests: release, abort and integrate each restore. A failed restore keeps
      the file and the pending record. `live restore` clears it on success.
      Add stays-silent tests: a release with no snapshot in the receipt runs
      no restore, and `live status` with no pending record warns nothing.
- [ ] Run `pnpm build` and `pnpm test` until green.
