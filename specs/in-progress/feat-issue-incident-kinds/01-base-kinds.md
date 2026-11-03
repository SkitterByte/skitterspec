---
github_issue_id: "#86"
---

# Phase 1 — Base kinds in the engine ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `issue-foo` resolves to `{ type: 'issue', slug: 'foo' }` and
`incident-foo` to `{ type: 'incident', slug: 'foo' }` everywhere the base
engine reads a kind, proven by tests.

## Tasks

- [x] Add `issue` and `incident` to `splitPrefix`
      (`packages/common/src/env/resolve.js:301`) and its doc comment
- [x] Add them to the spec-shaped argument check
      (`packages/common/src/cli.js:909`)
- [x] Sweep `packages/common/src` for any other hardcoded
      `feat|bug|hotfix|chore` kind list (grep, including `env/` naming for
      `spec-env up` / `nospec`) and widen each — the two sites above plus the
      resolve.js header comment were the only hits; `env` branch naming reads
      `splitPrefix`, so nothing else to widen
- [x] Confirm branch naming yields `issue/<slug>` and `incident/<slug>` from
      the existing type/slug pattern (no new code expected — test it)
- [x] Tests: both new prefixes resolve with type and slug; unknown prefix
      (`issues-foo`, `incidents-foo`) still falls back silently to `feat` +
      whole folder name (stays-silent test, `negative-checks.md` rule 3)
- [x] Run `pnpm -r test` and the repo typecheck — green before the phase is
      done (3,902 package tests + 4,199 root, 0 failures; no typecheck script
      in this repo)
