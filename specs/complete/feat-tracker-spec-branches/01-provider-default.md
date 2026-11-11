---
github_issue_id: "#171"
---

# Phase 1 — Default `specDocs` to branch when a provider is configured ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `land.specDocs` resolves to `"branch"` in a provider project with the
key unset, and to today's value everywhere else — proven by config tests.

## Tasks

- [x] Register each provider's config file through a `setProviderConfigFile`
      seam beside `setProviderEnvDefaults` (each provider bin passes its own
      `CONFIG_FILE`); true only on a file present, blind spot commented
- [x] Resolve `land.specDocs` in `config.js`: explicit value wins, else
      `"branch"` when the registered provider config exists, else `"trunk"`; update the
      `defaults` comment
- [x] Sync the change into each distribution's copy — nothing to do: the
      distributions are composed by `scripts/build-dist.js`, not committed
- [x] Update `env.config.md` and `spec-planning.md` (`land.specDocs` paragraph)
      and `/spec` SKILL.md ("Unless the project set…" → also the provider
      default)
- [x] Update `docs/reference.html` and bump its `verified:`
- [x] Tests: provider + unset → branch; provider + explicit trunk → trunk;
      typo → trunk; no provider file / unregistered base → trunk
      (stays-silent); `pnpm test` (4840) and `test:nested` (167) — green

## Notes

From this phase on, `specOnForkPoint` already exempts branch mode, so
`/spec-start` on a branch-only spec needs no further change.
