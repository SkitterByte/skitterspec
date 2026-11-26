---
github_issue_id: "#332"
---

# Phase 2 — `/spec-land` replaces `/spec-to-main` in ff mode ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the mid-spec trunk land has a name without "main", and the old
skill is pruned on update — proven by asset and init tests.

## Tasks

- [x] Rename `assets/skills/spec-to-main/` → `spec-land/`, drop §4b, refuse in
      PR mode naming `/spec-pr`
- [x] Add `spec-to-main` to the retired-skill pruning in `src/init.js`
      (customized copy kept with a warning, as today) — already generic:
      the manifest prunes any managed file no longer shipped; a test pins it
- [x] Replace every `/spec-to-main` reference in skills, rules, the CLAUDE.md
      section and `src/` hints with `/spec-land` or `/spec-pr` by mode
- [x] Add/extend tests (retired-file prune, stays-silent on a customized
      copy); `pnpm build && pnpm test` green
