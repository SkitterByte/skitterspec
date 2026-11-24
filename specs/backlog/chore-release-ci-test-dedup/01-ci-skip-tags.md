---
github_issue_id: "#308"
---

# Phase 1 — Stop `ci.yml` running on tags ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a tag push runs `release.yml` alone, proven by a workflow test.

## Tasks

- [ ] Change `ci.yml`'s trigger to `push: branches: ['**']` (keep
      `pull_request`), with a header comment saying why tags are excluded
- [ ] Update `release.yml`'s Windows-job comment and RELEASING.md (around line
      112), which both say `ci.yml` runs on a tag
- [ ] Add a `scripts/workflows.test.js` case asserting `ci.yml`'s push trigger
      names branches and no tags. Add a stays-silent case: a `pull_request`
      trigger with no filter is not flagged
- [ ] Run `pnpm test`; green before the phase is done
