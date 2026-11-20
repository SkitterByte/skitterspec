---
github_issue_id: "#281"
---

# Phase 3 — Install and conversion guide ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Someone with any existing install can move to the new layout by
following the steps, without reading code (proven by walking the steps on this
machine's real projects and the Windows VM).

## Tasks

- [ ] `MIGRATION.md` entry in the base and all four providers: what changed
      (the alias is gone, the base answers `skitterspec`) and the
      conversion table from the overview, with exact commands.
- [ ] Spell out the order for an old global provider: upgrade it first, then
      install the base (decision 10). Quote the `EEXIST` message so a reader
      who hit it finds the fix.
- [ ] Solo committed install → `init --local`: commit the staged removals,
      remove the dependency and the lockfile entry, install globally, run
      `update`.
- [ ] Team install: add the base as a second dev dependency at the same
      version.
- [ ] Windows VM: the same global installs inside the VM, then `update --all`
      there.
- [ ] Docs: an "Installing globally" section in `index.html`, the bin change on
      each provider page, `--all` in `reference.html`; run
      `node scripts/docs-freshness.js verify` for each page touched.
- [ ] Walk the guide on this machine's projects (skitterload, LSC on the Mac
      and on the VM) and fix anything that didn't match.
- [ ] Run `pnpm test`, green.
