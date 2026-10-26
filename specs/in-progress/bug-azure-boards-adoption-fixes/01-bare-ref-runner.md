---
github_issue_id: "#40"
---

# Phase 1 — bare `ref` builds its git runner ✅

> **Status:** Done

**Goal:** `pnpm exec skitterspec-azure-boards spec-sync ref` answers from the
branch instead of crashing, so `/commit` can splice the `Refs:` trailer.

- [x] `specSyncRef` builds a git reader bound to `dir` before calling
      `currentBranch`, exactly as the GitHub provider does.
- [x] Test green: `a bare ref answers from the branch, and only on success`
      (prints the id on a spec branch; on `main` exits 1 with empty stdout).
