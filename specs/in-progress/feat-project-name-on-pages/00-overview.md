---
github_identifier: "#174"
github_url: "https://github.com/SkitterByte/skitterspec/issues/174"
---

# Project name on generated pages

> **Type:** Feature
> **Name:** feat-project-name-on-pages
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/174
> **Author:** Reuben Greaves
> **Raised:** 2026-11-11
> **Area:** packages/common/src/env/review.js, packages/common/assets/review/page.html, packages/common/src/env/serve.js, packages/common/src/env/epicpage.js, packages/common/src/env/config.js, packages/common/assets/core/env.config.md, packages/common/assets/core/env.config.json.example
> **Stack:** worktree
> **Docs:** review, reference

## Summary

Every HTML page skitterspec generates — the review page, the served index and
the epic page — names the project it belongs to, in the browser tab and on the
page, so pages from different projects can be told apart.

## Problem

The review page's tab reads `feat-x`, the served index `spec diffs`, the epic
page `epic-y`. Someone running skitterspec in more than one repo — or reading
pages on a phone, where tabs are all that is visible — cannot tell which
project a page belongs to without opening it and reading the branch.

## Acceptance criteria

- A review page's tab title reads `<project> · <spec>`, and a muted line naming
  the project sits above the page heading — served, `file://` and published.
- The served index's tab and heading name the project (`<project> · spec diffs`).
- The epic page's tab reads `<project> · <epic>` with the same eyebrow line.
- Rendered from a spec worktree, the name is the primary checkout's (or the
  monorepo project folder's) name, never the worktree folder's.
- Setting `review.projectName` in `env.config.json` replaces the derived name
  everywhere; an empty or blank value falls back to the derived one.

## Decisions

1. **Name source: `review.projectName`, else the project folder's basename.**
   Zero config for the common case; an override for a folder named `app` or
   `repo`. Rejected: `package.json`/git remote — stack- or host-specific, and
   skitterspec knows nothing about the project's language.
2. **Derived from the primary anchor, not the cwd.** A worktree's folder is
   named after the spec, so `path.basename(cwd)` would repeat the spec name.
   The primary checkout joined with the monorepo project prefix
   (`resolvePrimaryCheckout`) is the folder that means "the project".
3. **Tab title + eyebrow.** `<title>` carries `<project> · <page>` (the tab is
   what a phone shows), and a small muted line above the h1 carries the name on
   the page. Rejected: folding it into the review subtitle — that line is
   already dense (branch · files · ± · time) and the epic page has none.
4. **Generated pages only.** Review page (all three transports), served index,
   epic page. `docs/*.html` are skitterspec's own hand-written docs and out of
   scope.
5. **Escaped like every other value.** The name comes from a config file and a
   folder name, and these pages are served over the network — it goes through
   `escapeHtml` / `textContent`, never raw markup.

## Solution overview

One helper resolves the display name (`config.review.projectName` trimmed, else
basename of the primary project folder). Each page's render takes it as an
input: the review template gains the name in its data island and its
`__REVIEW_TITLE__` substitution; `serve.js` and `epicpage.js` take it as a
parameter from their callers. Absent a name (cannot tell), pages render exactly
as today.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `review.projectName` (string, optional) |
| Route/UI | update | review page `<title>` + eyebrow (`data.project`) |
| Route/UI | update | served index `<title>`/h1 |
| Route/UI | update | epic page `<title>` + eyebrow |
| Service | add | project display-name resolver (env) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Name resolver + review page | ⬜ | [01-review-page.md](01-review-page.md) |
| 2 | Served index + epic page, docs | ⬜ | [02-index-epic-docs.md](02-index-epic-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-11 — Spec created.
