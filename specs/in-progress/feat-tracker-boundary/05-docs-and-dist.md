---
github_issue_id: "#68"
---

# Phase 5 — Docs and dist ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every doc describes the boundary as built. Nothing anywhere still
documents a release verb, the stage ladder, `releases`/`release.stages`
config, or state drift. The dist packages match the source.

## Tasks

- [ ] Delete `packages/linear/assets/core/ci-stages.md`, and `specs/.core/ci-stages.md`
      via `skitterspec update`
- [ ] Rewrite every release/CI/drift passage, file by file. The boundary goes
      in one paragraph, with a `released --json` → tracker CLI example where
      CI is discussed:
  - [ ] Site: `docs/index.html`, `docs/reference.html`, `docs/github.html`,
        `docs/linear.html`, `docs/jira.html`, `docs/azure-boards.html`
  - [ ] Config docs: `github.config.md`, `linear.config.md`, `jira.config.md`,
        `azure-boards.config.md`
  - [ ] SETUP: GitHub, Linear and Azure `assets/core/SETUP.md`
  - [ ] Setup skills: `spec-github-setup`, `spec-linear-setup`,
        `spec-jira-setup`, `spec-azure-setup`
  - [ ] `spec-sync` skills (GitHub, Azure) and every `/spec-status` (all four;
        the phase 4 rewrite covers their drift half)
  - [ ] READMEs: `packages/common/README.md` and the four `skitterspec-*`
        dist READMEs
  - [ ] Rules: `spec-planning.md`'s ticketing section (tells, doesn't track)
  - [ ] `RELEASING.md`: the mirror step is now `scripts/mirror-deployed.cjs`
  - [ ] CLAUDE.md sections shipped from `packages/common/assets`, if they
        mention any of it
- [ ] Final sweep: grep the repo outside `src/`, `test/` and history for
      `release create|deployed|complete|reconcile`, `spec-sync stage`,
      `release.stages`, `releases.series`, `deployedField`, `ladder`,
      `ci-stages` and state drift. Zero hits, or each remaining hit justified
      in the Changelog
- [ ] Update `docs-claims` / `assets` tests that pin the removed verbs
- [ ] Rebuild the `skitterspec-*` dist packages (`scripts/build-dist.js`)
- [ ] Note the major bump and the removed verbs in each provider's release notes
- [ ] `/spec-cancel feat-tracker-releases` — superseded by this spec
- [ ] Run typecheck + tests — green
