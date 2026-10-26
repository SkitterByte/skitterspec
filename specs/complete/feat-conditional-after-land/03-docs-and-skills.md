---
github_issue_id: "#38"
---

# Phase 3 — Docs and skills ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `env.config.md` documents conditional entries with the Prisma and
lockfile example, and the three landing skills run only the run list.

## Tasks

- [x] `assets/core/env.config.md`: `afterLand` and `setup` field reference —
      string vs `{ run, when }`, `{ setup: true }`, the range each land uses,
      unknown → run, and the Prisma + lockfile example from the overview
- [x] Note that `{ setup: true }` copies `run` literally: `afterLand` expands
      no tokens, so a setup step that uses `{slug}`-style tokens is a poor
      candidate for reuse
- [x] ~~Sync `specs/.core/env.config.md` in this repo~~. Not done by hand: that
      copy is a managed file several releases behind the asset, and
      `skitterspec update` refreshes it (see Changelog)
- [x] `/spec-complete`, `/spec-to-main`, `/no-spec`: one line each — run the
      listed commands; the `skipped` block is informational; `Notes` carries
      what was skipped and why
- [x] Extend `assets-after-land.test.js` to pin the skills' wording
- [x] Run `pnpm -r test` — green before the phase is done
