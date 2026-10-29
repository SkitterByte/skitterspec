---
github_issue_id: "#64"
---

# Phase 1 — `released --json` names the spec ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every ticket row from `released --json` carries `spec` and `url`, so
a consumer can act on a range without a second lookup. This is additive and
ships first.

## Tasks

- [x] Map ref → `{ spec, url }` from stamped overview frontmatter (the
      `linked` source) in one shared helper in provider-kit
- [x] Enrich `ticketsInRange` rows in GitHub, Linear and Azure `released`
      (`--json` and the human line) — `spec: null`, `url: null` when unlinked
- [x] Tests: linked ref gets both; unlinked ref stays null (stays-silent: no
      guess from a similar name); a spec in `complete/` still resolves
- [x] Run typecheck + tests — green

## Notes

Keep it network-free. A url that isn't stamped is `null`, never constructed.
