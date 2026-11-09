---
github_issue_id: "#145"
---

# Phase 5 — Providers and init ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every provider and `skitterspec init` work from a subfolder project —
proven by nested provider and init tests.

## Tasks

- [ ] Make provider `ignorePaths` (`specs/`, `.spec-env/`) prefix-aware in
      azure-boards, github, jira and linear config
- [ ] provider-kit `specs.js` and sync-core `retarget` / `summary` /
      `normalize`: spec discovery and `specs/<bucket>/<name>` paths via the
      project module
- [ ] `skitterspec init` / `init --isolation` / `update` from a subfolder:
      `.gitignore`, hook registration in `.claude/settings.json`, and paths it
      writes all land in the project folder
- [ ] Tests: nested `spec-sync status/ref/plan` for each provider; nested init
      produces an install `spec-env resolve` accepts; typecheck + test +
      `test:nested` green
