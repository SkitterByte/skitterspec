---
linear_issue_id: "SKS-96"
---

# Phase 4 — Install/init adoption and docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a project can adopt gating at install time or on a repair run, the same
way it adopts isolation, and the outward-facing docs describe it.

## Tasks

- [x] Add `installGating(dir, { enabled }, opts)` to `packages/common/src/init.js`,
      mirroring `installIsolation`: copies `gating.config.json.example` →
      `gating.config.json`, never clobbers an existing config without `--force`, and
      is called only when `mode !== 'update'`.
- [x] Add `--gating` to the `init` command in `src/cli.js` and thread it through to
      `init()` beside `isolation`.
- [x] Add a third question to `promptSetup` (`src/prompts.js`) — asked on a fresh
      interactive init only, phrased as the offer it is ("Ask whether each spec
      should ship behind a feature flag?").
- [x] Add a gating line to the init report next to `isolationNote`, reporting from
      what is on disk: on → the question will be asked; off → how to adopt it
      (`--gating`, or copy the example).
- [x] Verify `update`/`resync` refreshes the example and its docs but never writes
      the live `gating.config.json`, and never removes one the operator wrote.
- [x] Document the feature in `packages/common/README.md` and the root `README.md`;
      check `docs/index.html` for any claim the change contradicts.
- [x] Extend `packages/common/test/init.test.js`: example + docs scaffolded on every
      init; live config written only on opt-in; `update` never activates it; re-init
      over an existing setup is idempotent; a customized `gating.config.json`
      survives a resync.
- [x] Run `node --test`, `node scripts/build-dist.js all` and the docs/claims and
      skill-budget lints — green before the phase is done.

## Notes

**As built.**

- **No `init.js` change was needed for scaffolding**, as the plan predicted:
  `listCoreTemplates()` globs `assets/core/*.example` and `*.md`, so the template
  and its field docs shipped the moment phase 1 added them.
- `parse()` keeps an explicit option allowlist and threw `unknown option:
  --gating` until the flag was added there — the same place `--all` and `--json`
  had to be registered for `gating check`. Worth knowing: adding a flag to a
  handler is not enough.
- The prompt is asked **unconditionally**, not nested under isolation the way
  `mode` is. Gating and isolation are orthogonal, and nesting would have hidden it
  from every project that declines worktrees.
- `docs/index.html` was checked and **contradicts nothing** — it describes
  isolation and the lifecycle, neither of which this changes. Adding a gating
  section to the landing page is a separate piece of work, not a correction.

**Verified by hand**, not only by unit test: `init --yes` scaffolds the example
and docs while leaving the feature off; `init --yes --gating` writes the live
config and the report says so; `update` on an unadopted project does **not**
activate it; and a `guidance` edited by hand survives a resync.
