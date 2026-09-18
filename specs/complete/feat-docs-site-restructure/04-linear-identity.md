---
linear_issue_id: "SKS-365"
---

# Phase 4 — Re-skin linear.html: package identity ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** linear.html is visibly a different package: its own accent, its own
lockup, and a persistent banner naming the npm package.

## Tasks

- [x] Switch linear.html's accent variables to Linear indigo (`#5E6AD2`
      light; pick a brighter dark-theme pair with adequate contrast) across
      both theme states and the manual toggle.
- [x] Change the brand lockup to `skitterspec-linear` (glyph + name, no
      `+ linear` suffix pattern).
- [x] Add a slim package banner above or within the nav:
      `@skitterbyte/skitterspec-linear` — the superset package, with a link
      back to the base.
- [x] Sweep cross-links both ways: index/review/reference name the superset
      where they mention Linear; linear.html links Home · Review · Reference
      in the shared nav (indigo-skinned).
- [x] Check both themes and mobile widths by hand.
- [x] Run `node --test scripts/docs-claims.test.js` and `pnpm test` — green.

## Notes

Keep the structural CSS identical to the other pages — only identity tokens
(accent trio, lockup, banner) differ, so future shared edits stay a
copy-paste across files.
