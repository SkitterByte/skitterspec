---
github_issue_id: "#143"
---

# Phase 3 — Repo-relative matching ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** spec docs, noise and foreign paths classify correctly in a nested
project — proven by stays-silent tests that a healthy nested spec is never
reported as code or foreign.

## Tasks

- [ ] Normalise git outputs to root-relative (`--full-name`, `git -C <root>`)
      at each collector; never mix with cwd-relative `ls-files`
- [ ] env/review.js `isNoise` / `isSpecDocOf`: convert with `fromRepoPath`
      first; `null` (outside the project) is code
- [ ] env/serve.js: the `specs/.core/` check and the
      `ls-files -- specs/*/<folder>/*` pathspec via `toRepoPath`
- [ ] env/classify.js (`stage`) and cli.js `dirtyPaths` (`specEnvStage` ~3614
      and sibling ~3695)
- [ ] Tests: nested spec docs → owned / spec-doc; a `Sql/` change → code, never
      foreign or noise; `.spec-env/` inside the prefix → noise; stays-silent on
      prefix `''`; typecheck + test + `test:nested` green
