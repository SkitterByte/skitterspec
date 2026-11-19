---
github_issue_id: "#252"
---

# Phase 2 — Page: no publish, no allow-remote ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the review page has no published mode and no `Allow remote` button.
When it is opened on the tailnet URL it posts and is claimed like any other
served page. Page tests prove it.

## Tasks

- [x] `packages/common/assets/review/page.html`: remove the
      published-artifact detection (~l.2920) and every branch that hangs off it
      (store writes, the "verdict needs `/spec-reviewed`" copy, keep-the-tab
      handling).
- [x] Remove `allow-remote` from the action labels and commands
      (~l.3040–3045), and `remote` from `SURFACE_LABEL`.
- [x] Check that the tier strip on the page shows the `remote` tailnet URL the
      same way it shows `network`.
- [x] Tests: update `env-review-claim-action`, `env-review-live-on-commit`,
      `assets-review` and `assets-live-action-routing`. Assert that the page
      carries no `allow-remote` and no published-mode code.
- [x] Run `pnpm typecheck` and `pnpm test`, and get both green.

## Notes

- The tier strip carries only tiers that are off, plus the press that turns
  one on. An `on` tier, `remote` included, adds nothing, so the strip needed no
  change for the tailnet URL. An off `remote` offers no press of its own,
  because the `network` row's press turns both on.
- `env-review-claim-action` and `env-review-live-on-commit` were already moved
  to `allow-network` in phase 1. `assets-live-action-routing` reads the
  `spec-diff` skill, so it moves in phase 3.
