---
github_issue_id: "#328"
---

# Phase 3 — Skills write and read the new form ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** new specs write manual steps under `## Manual steps`, `/spec-next`
lists steps from that section, and the docs pages describe the projection.

## Tasks

- [ ] `/spec` (`packages/common/assets/skills/spec/SKILL.md`): the phase
      template gains an optional `## Manual steps` section, and an Issue spec's
      steps go there (Decision 8)
- [ ] `/spec-bug`: write manual steps such as a prod data fix or a deploy
      check under `## Manual steps`
- [ ] `/spec-next` §3 *Manual steps*: read `## Manual steps` first and fall
      back to judgment for legacy files. "Steps you had to write are saved
      first" now saves them into that section, with each script in a fenced
      block
- [ ] `spec-reports.md`, *Open manual steps are rows*: name `## Manual steps`
      as the source, still copied from the phase file
- [ ] Update `docs/{azure-boards,github,jira,linear}.html` (the projection)
      and `docs/reference.html` (the format), then run
      `node scripts/docs-freshness.js verify` on each page
- [ ] Run `pnpm build` and `pnpm test` (asset tests read the built
      distributions); green
