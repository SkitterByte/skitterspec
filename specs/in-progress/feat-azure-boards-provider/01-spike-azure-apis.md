---
linear_issue_id: "SKS-418"
github_issue_id: "#10"
---

# Phase 1 — Spike Azure DevOps APIs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the API assumptions behind Decisions 3–8 and 12 are confirmed against
a throwaway Azure DevOps organization (free tier), recorded in this file's
notes — no kit changes, those land with `feat-github-provider`.

## Tasks

- [ ] Create a throwaway ADO org + project; record org/project names here.
- [ ] Spike work item CRUD as JSON Patch: create of the configured type, update
      of title/description, parent/child link
      (`System.LinkTypes.Hierarchy-Forward`), child listing.
- [ ] Confirm direct `System.State` PATCH works, and capture the error shape a
      process rule returns on a refused move (feeds the named refusal in
      Decision 4).
- [ ] Answer the dialect question (Decision 6): can the API set a
      markdown-format description reliably (New Boards Hub), or is HTML the
      write format? Record which the dialect leads with.
- [ ] Confirm the PAT story: Work Items (Read & Write) scope suffices for
      items, links, comments and WIQL; record which op fails first on a
      too-narrow token (feeds doctor's probe, Decision 8).
- [ ] Confirm identity resolution for `System.AssignedTo` by email, and the
      lookup behind `users`/`whoami` (feeds phase 4).
- [ ] Confirm the WIQL title lookup for release idempotency and the Related
      link + comment writes (feeds phase 5, Decision 12).
- [ ] Check the official Azure DevOps MCP server's tool names for work items,
      links and comments; record which ops it cannot do (feeds phase 3's
      degradation table).

## Notes

Throwaway org/project names go here once created. Nothing in this phase talks
to Azure from tests — the spike is manual and recorded, not coded.
