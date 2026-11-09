---
github_issue_id: "#146"
---

# Phase 6 — Docs and dist ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the layout is documented and shipped in every distribution — proven by
the docs-freshness test and a clean dist build.

## Tasks

- [ ] SETUP.md and env.config.md (`packages/common/assets/core/`): the
      subfolder layout, find-up rule, where worktrees land, what is
      project-relative vs root-relative, `core.longpaths` on Windows
- [ ] docs/reference.html: the same, plus the `project:` line; bump its
      `verified:`
- [ ] Say where to install skitterspec in a subfolder project: in the project
      folder or above it — the hooks walk up, never down
- [ ] Rebuild the distribution packages (`scripts/build-dist.js`) and confirm
      the vendored copies carry the module
- [ ] Run `node scripts/docs-freshness.js impact`; typecheck + test +
      `test:nested` green
