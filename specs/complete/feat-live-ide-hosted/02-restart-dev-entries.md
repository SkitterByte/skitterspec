---
github_issue_id: "#200"
---

# Phase 2 — `dev[].reload` — restart-hosted apps ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a `dev` entry can declare `"reload": "restart"`, so an IDE-hosted app
is named for a manual restart on take and release instead of being probed as
a hot-reloading server.

## Tasks

- [x] `config.js`: accept `dev[].reload` (`"hot"` | `"restart"`), normalise a
      missing value to `"hot"`, and refuse any other value with a config error
- [x] `specEnvLiveTake`: probe only `hot` entries' `frontPort` for the
      `serverUp` gate. Pass the `restart` entries' names to `planTake`
- [x] `planTake`: emit `restart <name> after the switch (it does not
      hot-reload)` for each restart entry. A restart entry never contributes
      to check 7's refusal
- [x] `planRelease`: emit the same reminder after handing the checkout back
- [x] `/spec-live` command text (`packages/common/assets/commands/spec-live.md`):
      relay the restart warnings
- [x] Docs: `env.config.md` `dev` comment (`reload`, with a Visual Studio
      example), `docs/reference.html`, bump `verified:`
- [x] Tests: a restart entry not listening → take proceeds with a warning; a hot
      entry not listening → still refuses (unchanged); mixed hot + restart;
      release prints the reminder; bad `reload` value → config error. Add a
      stays-silent case where a config with no `reload` behaves byte-for-byte as
      before
- [x] Run typecheck + `pnpm test` — green before the phase is done
