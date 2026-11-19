---
github_issue_id: "#252"
---

# Phase 2 — Page: no publish, no allow-remote ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the review page has no published mode and no `Allow remote` button.
When it is opened on the tailnet URL it posts and is claimed like any other
served page. Page tests prove it.

## Tasks

- [ ] `packages/common/assets/review/page.html`: remove the
      published-artifact detection (~l.2920) and every branch that hangs off it
      (store writes, the "verdict needs `/spec-reviewed`" copy, keep-the-tab
      handling).
- [ ] Remove `allow-remote` from the action labels and commands
      (~l.3040–3045), and `remote` from `SURFACE_LABEL`.
- [ ] Check that the tier strip on the page shows the `remote` tailnet URL the
      same way it shows `network`.
- [ ] Tests: update `env-review-claim-action`, `env-review-live-on-commit`,
      `assets-review` and `assets-live-action-routing`. Assert that the page
      carries no `allow-remote` and no published-mode code.
- [ ] Run `pnpm typecheck` and `pnpm test`, and get both green.
