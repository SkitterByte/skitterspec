---
github_issue_id: "#146"
---

# Phase 6 — Docs and dist ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the layout is documented and shipped in every distribution — proven by
the docs-freshness test and a clean dist build.

## Tasks

- [x] env.config.md (`packages/common/assets/core/`): a *A project in a
      subfolder of its repo* section — the find-up rule, where worktrees land
      and what `{repo}` names, what is project-relative vs root-relative, the
      review page's git paths, the guard's reach, `core.longpaths` on Windows;
      `worktree.root`, `{worktreePath}` and `{repo}` notes corrected. There is
      no common SETUP.md — each provider's SETUP.md gets a short pointer
- [x] docs/reference.html: the layout and the `subfolder:` line; `verified`
      bumped
- [x] Say where to install skitterspec in a subfolder project: in the project
      folder or above it — the hooks walk up, never down (env.config.md,
      SETUP.md)
- [x] Rebuild the distribution packages (`pnpm build`); the vendored copies
      carry `env/project.js` and rewrite its requires. Smoke-tested the built
      azure-boards bin in an `LSC App/FF.CSC.Solution` repo: worktree beside
      the repo, quoted `git worktree add`, `subfolder:` line
- [x] `node scripts/docs-freshness.js impact`: azure-boards, github, index,
      jira, linear and review pages list covered changes — none describes
      behaviour this spec changed for a root-layout project; carried to the
      completion report. Full suite 4629 green, `test:nested` 167 green
