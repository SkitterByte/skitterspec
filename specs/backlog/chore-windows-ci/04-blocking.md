---
github_issue_id: "#151"
---

# Phase 4 — Make the Windows job blocking ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a Windows regression fails the build — proven by a green run with
no `continue-on-error`.

## Tasks

- [ ] Remove `continue-on-error` from the windows-latest `pnpm test` step and
      the comment that explains it
- [ ] Add a `scripts/workflows.test.js` assertion that no ci.yml step carries
      `continue-on-error`, with a stays-silent case for a comment mentioning it
- [ ] List every `win32` skip in the suite and confirm each names its reason
- [ ] Tests: workflows test green; a windows-latest run green and blocking
