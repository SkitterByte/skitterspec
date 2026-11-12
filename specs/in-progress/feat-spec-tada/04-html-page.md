---
github_issue_id: "#186"
---

# Phase 4 — Optional HTML page, and richer dates ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** on request, the recap renders as a self-contained HTML page; and the
window reads named, relative and written-out dates, for a span or one day.

## Tasks

- [x] `skitterspec tada --page --summary <file>` — render the digest plus
      the model's recap (markdown) into a self-contained page in the OS temp
      dir; print its `file://` path
- [x] Reuse the review page's styling where it fits; no server, no verdict
      controls (Decision 10)
- [x] Skill offers the page once, after the recap; the report carries the
      path as a row, never a question
- [x] Read `last <weekday>`, `last week`, `N days/weeks ago` (`3d`, `2w`)
      and written-out dates (`6 Nov`, `Nov 6`, with or without a year);
      refuse a numeric `11/12` as two readings
- [x] Add `--on <when>` for one day beside `--since <when>`; take a
      several-word value without quotes; label the window in local dates
- [x] Tests: page renders with and without a summary, escapes prompt text;
      run `pnpm typecheck` and `pnpm test` — green
