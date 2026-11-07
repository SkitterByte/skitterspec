---
github_issue_id: "#122"
---

# Phase 4 — Skills, config reference, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-hotfix` and `/spec-complete` speak the branch-based flow, and
the config is documented.

## Tasks

- [x] `/spec-hotfix`: with `releaseBranch` set, ask for no tag — fork from the
      branch and say which sha
- [x] `/spec-complete` §6-hotfix: branch-based land and carry lines; `Landed`
      names the release branch, PR/merge, tag (if any) and the carry
- [x] `env.config.md` and `docs/reference.html`: `hotfix.releaseBranch`,
      `hotfix.tag`, the rc-flow worked example (master, rc, env branches out of
      scope); bump `verified:`
- [x] Tests: asset text assertions; run `pnpm test` — green before done
