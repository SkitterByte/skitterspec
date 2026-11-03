---
github_issue_id: "#86"
---

# Phase 1 — Base kinds in the engine ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `issue-foo` resolves to `{ type: 'issue', slug: 'foo' }` and
`incident-foo` to `{ type: 'incident', slug: 'foo' }` everywhere the base
engine reads a kind, proven by tests.

## Tasks

- [ ] Add `issue` and `incident` to `splitPrefix`
      (`packages/common/src/env/resolve.js:301`) and its doc comment
- [ ] Add them to the spec-shaped argument check
      (`packages/common/src/cli.js:909`)
- [ ] Sweep `packages/common/src` for any other hardcoded
      `feat|bug|hotfix|chore` kind list (grep, including `env/` naming for
      `spec-env up` / `nospec`) and widen each
- [ ] Confirm branch naming yields `issue/<slug>` and `incident/<slug>` from
      the existing type/slug pattern (no new code expected — test it)
- [ ] Tests: both new prefixes resolve with type and slug; unknown prefix
      (`wibble-foo`) still falls back silently to `feat` + whole folder name
      (stays-silent test, `negative-checks.md` rule 3)
- [ ] Run `pnpm -r test` and the repo typecheck — green before the phase is
      done
