---
github_issue_id: "#154"
---

# Phase 1 — Epic kind and member headers ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `epic-` is a recognised kind everywhere a kind is, and the three
headers parse.

## Tasks

- [ ] Add `epic` to every kind-prefix pattern (`env/resolve.js` split and
      spec-shaped checks, and wherever `incident` is listed)
- [ ] `Type: Epic`: a spec with no phase files is valid for this kind only
- [ ] Parse `Epic:`, `Waits on:` (`<spec>` or `<spec> phase N`, comma-separated)
      and `Lanes:` beside `Incident:` in sync-core's header reading
- [ ] `/spec` proposes the Epic kind when the grill describes several specs and
      their order; writes the epic folder with no phase files
- [ ] Tests: prefix round-trips; header parse incl. malformed `Waits on` (kept as
      cannot-tell, never dropped); an epic with no phases passes validation
