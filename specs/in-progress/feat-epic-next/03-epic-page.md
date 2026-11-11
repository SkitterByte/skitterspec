---
github_issue_id: "#164"
---

# Phase 3 — Served epic page ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the review server renders an epic page per request at
`/<token>/epic-<name>`, refreshing every 30 s, linking to member pages and
never exposing a pass code.

## Tasks

- [ ] Route an `epic-` spec to the epic view where `serve.js` decides which
      view a spec gets; no new route shape
- [ ] Render the member table as HTML from the same `epicStatus` +
      `nextAction` answer; the `next` cell links to the member's page with a
      relative URL where a page waits
- [ ] Replace a pass code with `verdict waiting — /spec-reviewed in its tab`
      (Decision 6)
- [ ] Self-refresh every 30 s; light and dark like the review page
- [ ] Index page: list epics with in-flight members, linked
- [ ] End `epic status`'s human output with the epic page's tier stack when
      the review server is up, or the command that starts it
- [ ] Tests: route picks the epic view; member link is relative; no pass code
      in the HTML; refresh present; index lists the epic; an epic with no
      members renders the empty state rather than a 404
- [ ] Run typecheck + tests — green before the phase is done
