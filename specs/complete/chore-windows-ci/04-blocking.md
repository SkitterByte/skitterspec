---
github_issue_id: "#151"
---

# Phase 4 — Make the Windows job blocking ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a Windows regression fails the build — proven by a green run with
no `continue-on-error`.

## Tasks

- [x] Remove `continue-on-error` from the windows-latest `pnpm test` step and
      the comment that explained it
- [x] Add a `scripts/workflows.test.js` assertion that no ci.yml step carries
      `continue-on-error`, with a fires case and a stays-silent case for a
      comment mentioning it
- [x] List every `win32` skip and confirm each names its reason — 8, three
      reasons: POSIX mode bits (6), no executable bit (1), git's checkout-time
      `.claude` links (1)
- [x] Tests: workflows test green; run 42799372472 green on ubuntu and
      windows-latest with every step blocking; locally 4665 and 167
