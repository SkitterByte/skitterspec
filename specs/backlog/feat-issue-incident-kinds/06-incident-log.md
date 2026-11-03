---
github_issue_id: "#91"
---

# Phase 6 — Incident log at completion ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-complete` on an incident spec writes `incident-log.md` and
pushes it onto the incident item as a comment, refusing first while a linked
fix is still open.

## Tasks

- [ ] `/spec-complete` skill: an incident spec (folder prefix) takes the
      incident path — before completing, grep `specs/backlog/` and
      `specs/in-progress/` for fix specs carrying
      `> **Incident:** <this-name>`; any hit refuses with the fix named and
      offers to complete anyway with it listed as outstanding (operator
      answers; the choice goes in the Changelog). Blind spot, named in the
      skill text: an authored-but-unlanded fix spec is invisible to the grep
- [ ] `incident-log.md` written into the spec folder from the spec and its
      linked fixes, covering: summary · severity · timeline (started,
      detected, mitigated, resolved) · impact (who, what, how long) · root
      cause · fixes (linked specs, their tickets, the releases they shipped
      in — releases via `spec-sync released` where a provider is installed,
      else from the spec's own record) · what went well / what didn't ·
      follow-ups, each offered as a `/spec`
- [ ] Push the log as a **comment** on the incident item (all four providers
      have a comment surface; reuse the `spec-sync preserve` comment
      machinery where possible). The description stays the generated spec
      mirror. No provider installed / unreachable tracker → say so in one
      line, log stays in the repo, completion proceeds
- [ ] Completion still moves the spec and transitions the tracker through the
      per-type map from phase 3 (ereqs: Incident → Closed)
- [ ] Tests: refusal fires on an open linked fix and a test proves nothing
      moved; completes clean with no linked fixes (stays-silent); log covers
      every section (template test); comment push exercised against the fake
      adapters
- [ ] Docs: reference page — the incident lifecycle end-to-end
- [ ] Run `pnpm -r test` + typecheck — green
