---
linear_identifier: "SKS-417"
linear_url: "https://linear.app/skitterbyte/issue/SKS-417/skitterspec-azure-boards-an-azure-devops-boards-ticketing-provider"
github_identifier: "#9"
github_url: "https://github.com/SkitterByte/skitterspec/issues/9"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# skitterspec-azure-boards — an Azure DevOps Boards ticketing provider

> **Type:** Feature
> **Name:** feat-azure-boards-provider (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-10-22)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-22
> **Area:** packages/provider-kit (consumes the ref-pattern, assignment and
> release seams `feat-github-provider` builds), new packages/azure-boards, new
> packages/skitterspec-azure-boards, packages/common (init.js engine
> bins/protected lists, hooks), scripts/{build-dist,release,release-notes,dev-*}.js,
> .github/workflows/release.yml, docs/
> **Stack:** worktree

## Problem

ereqs is the live user keeping `skitterspec-linear` — and the $18/month Linear
plan — alive (`feat-github-provider` Decision 12). ereqs' code and planning
already live in one Azure DevOps project: Boards ships free with it, has work
items, parent/child hierarchy, assignees, states and tags, and Microsoft runs
an official MCP server for it. A provider that syncs specs to Boards is what
lets ereqs leave Linear and the subscription be cancelled outright. With the
provider-kit proven by two providers and `feat-github-provider` making its
seams provider-neutral, the third provider costs an adapter, not an
architecture.

## Decisions

1. **Azure DevOps Services (cloud) only.** REST 7.1, work items written as
   JSON Patch documents, PAT basic auth. On-prem Azure DevOps Server is a
   possible later variant, not v1 — the Jira Cloud/DC precedent.
2. **Depends on `feat-github-provider` landing first.** It consumes three kit
   seams that spec builds: the provider-supplied ref pattern (its phase 1),
   assignment hoisted into the kit (phase 4), and the neutral release seam
   (phase 5). Rejected: hoisting them here independently — two specs racing to
   restructure the same kit files.
3. **Process-template agnostic via config.** Boards' work item types and
   states are process-defined (Basic: Issue/Task; Agile: User Story/Task;
   custom anything), so `azure-boards.config.json` names `workItemType` (spec)
   and `childType` (phase), and `states` maps bucket → state name per the
   project's own workflow. Names are validated at run time against the type's
   actual states; an unknown name is a named refusal (positive signal: states
   listed, target absent), as Jira's transitions are. Rejected: hardcoding the
   Basic template — ereqs' process is the client's to choose.
4. **Direct state writes, rule-aware.** Unlike Jira there is no transition
   API: `System.State` is PATCHed directly, and a process rule that refuses
   the move comes back as an API error — relay it as the named refusal rather
   than pre-computing legality. Phase 1 confirms the error shape.
5. **Hierarchy: parent/child links.** Spec → work item of `workItemType`;
   phase → child of `childType` linked `System.LinkTypes.Hierarchy-Forward`;
   tasks → checklist in the child's description. The Linear/Jira mapping,
   unchanged.
6. **Dialect: markdown → HTML writes, HTML → canonical text for verify and
   snapshot hashing.** `System.Description` is HTML. New Boards Hub can render
   markdown per field — phase 1 checks whether the API can set that reliably;
   if yes the dialect writes markdown and the HTML renderer stays as the
   fallback. Written in-repo; `prompts` stays the published packages' only
   runtime dependency (the ADF precedent).
7. **Transport: REST primary, Microsoft's official Azure DevOps MCP server as
   the keyless fallback**, with the per-command degradation discipline the
   other providers use (impossible ops exit 1 and say so; the rest hand the
   skill instructions).
8. **Credentials: a PAT with Work Items (Read & Write).**
   `AZURE_DEVOPS_EXT_PAT` env (the official CLI's name) wins, then the kit's
   v2 store namespaced `azure-boards`. ADO reports no scopes header, so doctor
   probes a representative op per capability and names the one that failed.
   Never via chat.
9. **Per-provider frontmatter: `azure_identifier` (`AB#123`), `azure_url`,
   `azure_item_id`.** Existing `linear_*` stamps are untouched — complete and
   cancelled specs keep them as history.
10. **Trailer `Refs: AB#123`.** ereqs' code is in Azure Repos, where commit
    text is not auto-scanned (`AB#N` linking belongs to the GitHub↔Boards
    integration, absent here), so the trailer is inert by construction. The
    kit's provider-supplied ref pattern gets `AB#\d+`; ereqs' Linear team key
    goes in config `refs.foreignPatterns` so `released` counts its history as
    known-foreign rather than unreferenced.
11. **v1 scope: github-v1 parity — core + assignment + intake + releases.**
    Core = link, plan/apply/stamp/record/verify, status, list, linked, ref,
    released, preserve, doctor, credentials, init-config, states, setup skill,
    all seams. Assignment maps to `System.AssignedTo` through the kit's
    hoisted seam, identity resolved by email (`/spec-claim`, `whoami`,
    `users`). Intake adopts an existing work item, routes on
    `intake.bugTags`/`hotfixTags` (Boards has tags, not labels), preserves the
    original description as a comment. Deferred: retarget, reattach, sanitise.
12. **Releases: a release work item per release.** Boards has no Releases
    object, so `release create <tag>` mints (or finds and updates — idempotent
    by a WIQL title lookup, refusing on *cannot tell*) one work item of
    `releases.workItemType`, titled by version, body = the release notes,
    tickets attached as Related links, one comment on each attached ticket.
    `deployed <version> <env>` moves that item's state to the env's configured
    state; `complete` closes it. Rejected: a Deployed field per ticket (GitHub
    parity, but needs an inherited-process custom field the client's org admin
    must add) and tags per ticket (no single object for a PM to open).
13. **Migration: open specs only.** ereqs' backlog and in-progress specs are
    linked to Boards by an ordinary push once `azure-boards.config.json`
    exists (unlinked-for-azure → create). No bulk minting. The swap itself
    happens in ereqs' repo; this spec ships the provider, the setup skill and
    a migration doc.
14. **Binary contract honoured.** `@skitterbyte/skitterspec-azure-boards`
    ships `skitterspec-azure-boards` aliased as `skitterspec`; install exactly
    one of the five distributions.

## Solution overview

Same layout the Jira spec established and GitHub repeats:

```
packages/
  provider-kit/            consumed as feat-github-provider leaves it: ref
                           pattern from provider, assignment ops, release seam
  azure-boards/        NEW REST client (JSON Patch, WIQL), HTML/markdown
                           dialect, state writes, MCP matchers, skills, seams
  skitterspec-azure-boards/  NEW published superset
```

```jsonc
// specs/.core/azure-boards.config.json
{
  "azure": { "orgUrl": "https://dev.azure.com/<org>", "project": "<project>",
             "workItemType": "Issue", "childType": "Task",
             "areaPath": "" },
  "states": { "backlog": "To Do", "in-progress": "Doing",
              "complete": "Done", "cancelled": "Done" },
  "intake": { "tag": "", "bugTags": ["bug"], "hotfixTags": [] },
  "auth":   { "tokenEnv": "AZURE_DEVOPS_EXT_PAT" },
  "refs":   { "foreignPatterns": ["<LINEAR-KEY>-\\d+"] },
  "releases": { "workItemType": "Release",
                "series": [{ "tagPrefix": "v",
                             "envs": { "staged": "Staged", "published": "Published" } }] }
}
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Package | add | `packages/azure-boards` (private), `@skitterbyte/skitterspec-azure-boards` (published) |
| CLI command | add | `skitterspec-azure-boards spec-sync <core + assign/users/whoami>` + `skitterspec` alias |
| CLI command | add | `spec-sync release create\|deployed\|complete` (Azure impl of the neutral seam) |
| Config key | add | `specs/.core/azure-boards.config.json` (+ example + reference doc) |
| Schema/model | update | credentials store gains the `azure-boards` namespace |
| Skill/rule | add | azure-boards skills (push, status, sync, list, claim, setup) + seam fragments, `commit-trailers.md` (`Refs: AB#N`) |
| Service | update | common: `ENGINE_BINS`, `PROTECTED_*`, hook engine loops |
| CLI command | update | build-dist, release, release-notes, dev-link/sync/unlink |
| Business rule | update | release workflow gains the fifth tag series |
| Route/UI | add | `docs/azure-boards.html`, docs index links, dist README |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Spike Azure DevOps APIs | ✅ | [01-spike-azure-apis.md](01-spike-azure-apis.md) |
| 2 | Azure adapter core (REST, dialect, states) | ✅ | [02-azure-adapter.md](02-azure-adapter.md) |
| 3 | CLI, MCP, skills, seams, intake | ✅ | [03-cli-skills-seams.md](03-cli-skills-seams.md) |
| 4 | Assignment on the kit seam | ⬜ | [04-assignment.md](04-assignment.md) |
| 5 | Release work item on the release seam | ⬜ | [05-release-seam.md](05-release-seam.md) |
| 6 | Distribution + release wiring | ⬜ | [06-distribution-release.md](06-distribution-release.md) |
| 7 | Docs, live smoke, ereqs migration path | ⬜ | [07-docs-smoke-migration.md](07-docs-smoke-migration.md) |

## Open questions

- None — phase 1's spike confirms the token, state-write, markdown and
  identity assumptions, and its notes record anything that moves a decision.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-22 | Ready | backlog | Reuben Greaves |
| 2026-10-22 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-22 — Spec created, fleshing out the follow-up recorded in
  `feat-github-provider` (Azure Boards for ereqs; what lets Linear be
  cancelled). Scope set to github-v1 parity; release carrier chosen as a
  release work item over a per-ticket Deployed field or tags.
- 2026-10-23 — Phase 1 spike: Decision 6's open half resolved — the dialect
  leads with **markdown** (`multilineFieldsFormat`, byte-identical round-trip;
  comments via `?format=markdown`), so phase 2 drops the HTML write path.
  Doctor's narrow-token probe is identity search (401 without Identity Read);
  Work Items R&W covers everything else including AssignedTo-by-email.
- 2026-10-23 — Phase 2: `commands.js` deferred to phase 3 beside the
  `cli-sync.js` it routes to. The op contract drops `listTransitions` (no
  transition API on Azure); HTTP 203 is treated as a credential rejection
  (Azure's bad-PAT shape).
- 2026-10-23 — Phase 3: `released` ships as a NAMED REFUSAL rather than a
  mis-scan — the kit's trailer scan hardcodes `KEY-N`, and Decision 2 forbids
  hoisting the provider-pattern seam here. The wiring moves to phase 5's first
  task, blocked on `feat-github-provider`. State validation runs against the
  UNION of both configured types' states, since one `states` map serves parent
  and child items. Setup skill named `/spec-azure-setup`.
