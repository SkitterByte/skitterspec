---
linear_issue_id: "SKS-96"
---

# Phase 4 — Install/init adoption and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a project can adopt gating at install time or on a repair run, the same
way it adopts isolation, and the outward-facing docs describe it.

## Tasks

- [ ] Add `installGating(dir, { enabled }, opts)` to `packages/common/src/init.js`,
      mirroring `installIsolation`: copies `gating.config.json.example` →
      `gating.config.json`, never clobbers an existing config without `--force`, and
      is called only when `mode !== 'update'`.
- [ ] Add `--gating` to the `init` command in `src/cli.js` and thread it through to
      `init()` beside `isolation`.
- [ ] Add a third question to `promptSetup` (`src/prompts.js`) — asked on a fresh
      interactive init only, phrased as the offer it is ("Ask whether each spec
      should ship behind a feature flag?").
- [ ] Add a gating line to the init report next to `isolationNote`, reporting from
      what is on disk: on → the question will be asked; off → how to adopt it
      (`--gating`, or copy the example).
- [ ] Verify `update`/`resync` refreshes the example and its docs but never writes
      the live `gating.config.json`, and never removes one the operator wrote.
- [ ] Document the feature in `packages/common/README.md` and the root `README.md`;
      check `docs/index.html` for any claim the change contradicts.
- [ ] Extend `packages/common/test/init.test.js`: example + docs scaffolded on every
      init; live config written only on opt-in; `update` never activates it; re-init
      over an existing setup is idempotent; a customized `gating.config.json`
      survives a resync.
- [ ] Run `node --test`, `node scripts/build-dist.js all` and the docs/claims and
      skill-budget lints — green before the phase is done.
