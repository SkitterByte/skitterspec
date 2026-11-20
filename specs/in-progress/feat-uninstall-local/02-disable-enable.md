---
github_issue_id: "#269"
---

# Phase 2 — Disable and enable, with tests ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec disable` and `enable` switch a local install off and on
for this machine's Claude without touching its files, proven by tests on a
fixture that ran `init --local`.

## Tasks

- [ ] Add `disable(dir)` to `init.js`: refuse a team install; write `skillOverrides: "off"` for every managed skill and command, `claudeMdExcludes` globs for every managed rule; remove our hooks and the CLAUDE.local.md block; record `enabled: false` in the manifest
- [ ] Add `enable(dir)`: no manifest or no managed files → the `init --local` path; else remove only the override and exclude entries naming managed paths, re-register the hooks, re-write the CLAUDE.local.md block, record `enabled: true`
- [ ] Keep `update` (resync) from re-adding hooks or the block while `enabled` is false; keep `readManifest`/`writeManifest` carrying the field
- [ ] Have `uninstall` also remove any override and exclude entries it finds, so a disabled install uninstalls clean
- [ ] Wire `disable` and `enable` into `cli.js` and its help text
- [ ] Tests: disable leaves every file and writes the overrides, excludes, no hooks, no block; enable restores hooks and block and removes only our entries (a developer's own override, exclude and hook survive both); both are idempotent; enable on a bare repo installs; update on a disabled install stays disabled; a team install refuses; uninstall after disable leaves no override or exclude behind
- [ ] Run `pnpm test` — green before the phase is done
