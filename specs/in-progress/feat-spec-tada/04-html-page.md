---
github_issue_id: "#186"
---

# Phase 4 — Optional HTML page ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** on request, the recap renders as a self-contained HTML page.

## Tasks

- [ ] `skitterspec tada --page --summary <file>` — render the digest plus
      the model's recap (markdown) into a self-contained page in the OS temp
      dir; print its `file://` path
- [ ] Reuse the review page's styling where it fits; no server, no verdict
      controls (Decision 10)
- [ ] Skill offers the page once, after the recap; the report carries the
      path as a row, never a question
- [ ] Tests: page renders with and without a summary, escapes prompt text;
      run `pnpm typecheck` and `pnpm test` — green
