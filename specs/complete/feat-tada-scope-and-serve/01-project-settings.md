---
github_issue_id: "#192"
---

# Phase 1 — Project name and category, and scoping by them ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `project.name`/`project.category` are read from `env.config.json`,
name every page, and scope the ta-da report — proven by config and digest
tests.

## Tasks

- [x] Add `project: { name, category }` to the config defaults, merge and
      unknown-key handling (`env/config.js`); document it in
      `assets/core/env.config.md` and the shipped example
- [x] `projectName(config)` reads `project.name`, then `review.projectName`,
      then the folder (`env/project.js`); every page caller unchanged
- [x] Digest: each project carries its `name` (from its config) and
      `category`; filter to the running project's category, uncategorised
      excluded; run from an uncategorised place includes all
- [x] `--all-projects` includes everything; skill and help text say so
- [x] Tests: precedence of the three name sources; a legacy
      `review.projectName` config still names the page; category filter
      (same, different, uncategorised, non-skitterspec repo, run from
      uncategorised); `--all-projects`; a stays-silent test for a repo with
      no config; run `pnpm test` — green
