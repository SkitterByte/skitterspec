---
github_issue_id: "#171"
---

# Phase 1 — Default `specDocs` to branch when a provider is configured ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `land.specDocs` resolves to `"branch"` in a provider project with the
key unset, and to today's value everywhere else — proven by config tests.

## Tasks

- [ ] Export the provider config filenames from provider-kit as one list, and a
      `providerConfigured(dir)` helper that answers true only on a file present
      (comment the blind spot beside it)
- [ ] Resolve `land.specDocs` in `config.js`: explicit value wins, else
      `"branch"` when `providerConfigured`, else `"trunk"`; update the
      `defaults` comment
- [ ] Sync the change into each distribution's copy per the repo's existing
      convention
- [ ] Update `env.config.md` and `spec-planning.md` (`land.specDocs` paragraph)
      and `/spec` SKILL.md ("Unless the project set…" → also the provider
      default)
- [ ] Update `docs/reference.html` and bump its `verified:`
- [ ] Tests: provider + unset → branch; provider + explicit trunk → trunk;
      no provider → trunk (stays-silent); unreadable `.core` → trunk; run the
      typecheck and test commands — green

## Notes

From this phase on, `specOnForkPoint` already exempts branch mode, so
`/spec-start` on a branch-only spec needs no further change.
