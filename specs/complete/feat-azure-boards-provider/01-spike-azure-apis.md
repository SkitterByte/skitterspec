---
linear_issue_id: "SKS-418"
github_issue_id: "#10"
---

# Phase 1 — Spike Azure DevOps APIs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the API assumptions behind Decisions 3–8 and 12 are confirmed against
a throwaway Azure DevOps organization (free tier), recorded in this file's
notes — no kit changes, those land with `feat-github-provider`.

## Tasks

- [x] Create a throwaway ADO org + project; record org/project names here.
- [x] Spike work item CRUD as JSON Patch: create of the configured type, update
      of title/description, parent/child link
      (`System.LinkTypes.Hierarchy-Forward`), child listing.
- [x] Confirm direct `System.State` PATCH works, and capture the error shape a
      process rule returns on a refused move (feeds the named refusal in
      Decision 4).
- [x] Answer the dialect question (Decision 6): can the API set a
      markdown-format description reliably (New Boards Hub), or is HTML the
      write format? Record which the dialect leads with.
- [x] Confirm the PAT story: Work Items (Read & Write) scope suffices for
      items, links, comments and WIQL; record which op fails first on a
      too-narrow token (feeds doctor's probe, Decision 8).
- [x] Confirm identity resolution for `System.AssignedTo` by email, and the
      lookup behind `users`/`whoami` (feeds phase 4).
- [x] Confirm the WIQL title lookup for release idempotency and the Related
      link + comment writes (feeds phase 5, Decision 12).
- [x] Check the official Azure DevOps MCP server's tool names for work items,
      links and comments; record which ops it cannot do (feeds phase 3's
      degradation table).

## Notes

Throwaway org/project names go here once created. Nothing in this phase talks
to Azure from tests — the spike is manual and recorded, not coded.

Throwaway: org `rjgreaves`, project `spike` (Basic process), spiked live
2026-10-23 — work items 1 (Issue), 2 (child Task), 3 (release Issue) hold the
evidence.

### Spike results (live, REST 7.1)

- **CRUD + hierarchy.** JSON Patch create/update of an Issue works as planned;
  a child Task created with a `System.LinkTypes.Hierarchy-Reverse` relation in
  the same patch comes back linked, and the parent's `$expand=relations` read
  lists it as `Hierarchy-Forward`.
- **Markdown descriptions round-trip byte-identical.** Create with
  `/multilineFieldsFormat/System.Description: Markdown` returned the exact
  markdown sent (checkboxes included) with format `markdown`. The dialect
  **leads with markdown**; the HTML renderer is dead weight — drop it from
  phase 2 unless verify-read-back of HTML-era items needs it.
- **Comments take markdown too**: `POST …/comments?format=markdown`
  (api-version 7.1-preview.4) returns `format: "markdown"` — preserve-original
  and release comments both get clean markdown.
- **Direct state PATCH works** (`To Do` → `Doing`, HTTP 200). A bad value is
  HTTP 400 `typeKey: RuleValidationException`, message naming the field and
  value — the named-refusal relay in Decision 4 keys off that.
- **Per-type states carry categories**:
  `GET workitemtypes/Issue/states` → To Do (Proposed), Doing (InProgress),
  Done (Completed) — config validation lists these on an unknown-state refusal,
  and the category is a free sanity check for terminal buckets.
- **WIQL title lookup** (`[System.Title] = '…' AND [System.WorkItemType]`)
  returns the id — release idempotency confirmed. `System.LinkTypes.Related`
  attaches in a create patch — the release carrier works as designed.
- **Scopes**: Work Items (Read & Write) alone covered items, links, comments,
  WIQL, state writes, **and** `AssignedTo` by email (resolved to the display
  name server-side). `whoami` needs no extra scope: `GET /_apis/connectionData`
  returns the authenticated user's id/display name/uniqueName. The op that
  fails first on a narrow token is **identity search**
  (`vssps…/_apis/identities?searchFilter=General` → HTTP 401): doctor's probe
  for the `users` capability, named as missing Identity (Read)/`vso.identity`.
  Cannot tell from here whether that scope was granted on this PAT — phase 4
  re-probes with a known-scoped token before wording the refusal.

- **Dialect (Decision 6) — markdown is a first-class write.** The JSON Patch
  takes `{"op":"add","path":"/multilineFieldsFormat/System.Description","value":"Markdown"}`
  beside the field write, for Description/Repro Steps/Acceptance Criteria and
  custom large-text fields. Default is HTML; a field saved as Markdown
  **cannot revert to HTML**, which is fine one-way: the provider always writes
  markdown. Live spike still to confirm round-trip + the comments API format.
  Source: [Markdown Support Arrives for Work Items](https://devblogs.microsoft.com/devops/markdown-support-arrives-for-work-items/).
- **Official MCP server coverage** (remote `https://mcp.dev.azure.com/{org}`,
  local `@azure-devops/mcp`; remote is the recommended variant): work items via
  `wit_work_item_write` (`create` / `update` / `update_batch` / `add_child`),
  comments via `wit_work_item_comment_write` (`add`/`update`) +
  `wit_work_item list_comments`, links via `wit_work_item_link_write`
  (`link`/`unlink`/`link_to_pull_request`/`add_artifact_link`), queries via
  `wit_query` (`get`/`get_results`/`wiql`), identities via
  `core_get_identity_ids`. No dedicated state tool — state moves ride `update`,
  matching the REST design. No obvious cannot-do for the provider's op set;
  phase 3 re-checks against the live server. Auth is Microsoft account
  (`azcli` locally), i.e. keyless for the fallback, as the other providers'
  MCP paths are.
