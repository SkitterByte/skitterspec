---
github_issue_id: "#91"
---

# Phase 6 — Incident log at completion ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-complete` on an incident spec writes `incident-log.md` and
pushes it onto the incident item as a comment, refusing first while a linked
fix is still open.

## Tasks

- [x] `/spec-complete` skill: `Type: Incident` specs take the incident path —
      grep `specs/backlog/` + `specs/in-progress/` for
      `> **Incident:** <this-name>`; a hit refuses naming the fix and offers
      to complete anyway with it listed as outstanding (operator answers,
      choice recorded in the Changelog); the branch-local blind spot is named
      beside the check
- [x] `incident-log.md` written into the spec folder, covering every decision-3
      section (summary · severity · timeline · impact · root cause · fixes
      with tickets and releases via `spec-sync released` · went well/badly ·
      follow-ups offered as `/spec`)
- [x] Push the log as a **comment**: new `spec-sync comment <spec> --file <f>`
      subcommand on all four providers (posts via each adapter's
      `createComment`; misuse exits 1, every cannot-tell — unlinked, offline,
      no credentials, MCP transport — exits 0 and says so). The description
      stays the generated spec projection
- [x] Completion still moves the spec and transitions the tracker through the
      per-type map from phase 3 (ereqs: Incident → Closed)
- [x] Tests: `assets-incident-kind.test.js` pins the refusal/offer, the log
      sections, the comment command and the kind gating (stays-silent
      included); comment-verb tests against the fake adapters in azure,
      github, jira and linear
- [x] Docs: the four provider pages' command tables gain the `comment` verb;
      the reference page's incident wording landed in phase 4
- [x] Run `pnpm -r test` + typecheck — green (packages 0 failures, root 4,235
      pass; no typecheck script in this repo)
