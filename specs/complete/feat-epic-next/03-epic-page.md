---
github_issue_id: "#164"
---

# Phase 3 — Served epic page ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the review server renders an epic page per request at
`/<token>/epic-<name>`, refreshing every 30 s, linking to member pages and
never exposing a pass code.

## Tasks

- [x] Route an `epic-` spec to the epic view where `serve.js` decides which
      view a spec gets; no new route shape
- [x] Render the member table as HTML from the same `epicStatus` +
      `nextAction` answer; the `next` cell links to the member's page with a
      relative URL where a page waits
- [x] Replace a pass code with `verdict waiting — /spec-reviewed in its tab`
      (Decision 6)
- [x] Self-refresh every 30 s; light and dark like the review page
- [x] Index page: list epics with in-flight members, linked
- [x] End `epic status`'s human output with the epic page's tier stack when
      the review server is up, or the command that starts it
- [x] Tests: route picks the epic view; member link is relative; no pass code
      in the HTML; refresh present; index lists the epic; an epic with no
      members renders the empty state rather than a 404
- [x] Run typecheck + tests — green before the phase is done

## Notes

- An epic whose own documents are uncommitted (being written by `/spec`) keeps
  its authoring page at the same address; every other epic address is the
  epic page. Tested.
- The epic's readers moved out of `cli.js` into `env/epicread.js`, so the CLI
  and the server read an epic the same way; the page itself is
  `env/epicpage.js`.
