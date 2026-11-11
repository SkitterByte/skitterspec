---
github_issue_id: "#175"
---

# Phase 1 — Name resolver + review page ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the review page names its project in the tab and above the heading,
from config or the primary project folder — proven by render tests.

## Tasks

- [ ] Add `review.projectName` to the config defaults/validation in
      `packages/common/src/env/config.js` (optional string; blank = unset)
- [ ] Add a resolver returning the display name: trimmed config value, else
      the basename of the primary project folder (`resolvePrimaryCheckout`
      plus the project prefix) — never the worktree's folder
- [ ] Carry it into the review data (`data.project`) and the
      `__REVIEW_TITLE__` substitution as `<project> · <spec>`
- [ ] Render a muted eyebrow line above `#title` in
      `packages/common/assets/review/page.html` via `textContent`; omit it
      when `data.project` is absent
- [ ] Confirm the published (remote) render carries the same title
- [ ] Tests: config override wins; blank override falls back; rendered from a
      worktree path the name is the primary's; a name with `<`/`&` is escaped;
      no name → title and header unchanged (stays-silent case)
- [ ] Run `pnpm typecheck` and `pnpm test` — green before the phase is done

## Notes

The other packages' `src/env/*.js` are built copies of `packages/common` —
edit common only, then rebuild as the repo does.
