# Spec-as-Issue: remap the Linear mirror to Issue + sub-issues

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-08-27)
> **Name:** feat-spec-as-issue-mapping
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-27
> **Area:** packages/sync-core (normalize, compare, push, base), packages/linear
> (config, cli-sync, skills spec-push/spec-status, seams), skitterspec `/spec`
> template + `/spec-init`, READMEs, MIGRATION, docs/index.html
> **Stack:** worktree

## Problem

Now that sync is one-way (the repo is canonical, Linear is a generated
read-only mirror), the old mapping is the wrong shape. Today a spec is a Linear
**Project**, each phase a **Milestone**, and every task — including nested
sub-checkboxes — its own **Issue**. A single 6-phase spec projects to ~92 issues,
most of them one-line sub-bullets, and 285 specs would bury the Projects view.
The mirror is no longer a working surface anyone edits; it exists for
visibility. So it should carry spec-level and phase-level status, not every leaf
task. The container and the granularity both need to change.

## Decisions

1. **A spec is a Linear Issue, not a Project.** Projects are heavyweight (lead,
   target date, updates, cycles) and one-per-spec floods the Projects view. An
   Issue is the right weight for "one spec = one trackable unit," lives in the
   team/cycles, and its description holds the overview. Rejected: Project (too
   heavy), Document (not trackable — no state).
2. **Each phase is a sub-issue** of the spec issue (`parentId` = the spec
   issue). Sub-issues give per-phase state and are individually linkable.
3. **Tasks are not synced at all.** They live only in the repo phase files. The
   sub-issue description carries the phase **goal only** — no task checklist.
   This is the core de-granularisation: ~92 → ~7 for the Strava spec.
4. **Sub-issue state maps the phase emoji** through the existing `states` map:
   `⬜ → states.backlog`, `🔄 → states['in-progress']`, `✅ → states.complete`.
   No separate phase-state map. The spec issue's own state maps the folder
   bucket through the same `states` (backlog/in-progress/complete/cancelled).
5. **`states` become Issue workflow-state names, not Project statuses.** The
   default names already read as issue states; the code, comments and
   `validateStates` must now check them against the workspace's **issue**
   workflow states.
6. **Grouping is optional and config-driven.** If `linear.projectId` is set,
   every spec issue is added to that Linear Project (a "Specs" umbrella);
   otherwise the issue stands alone in the team. `initiativeId` is retired (it
   grouped projects, which no longer exist).
7. **Id storage:** `spec_identifier` (overview frontmatter) holds the spec
   **issue** identifier; `linear_milestone_id` (phase frontmatter) is renamed
   `linear_issue_id` and holds the **sub-issue** identifier.
8. **Ships as `skitterspec-linear@9.0.0`** — breaking: config keys, stored
   frontmatter, and the snapshot format all change. Base `skitterspec` is
   unaffected (stays 15.x). Bundles the already-landed title fix (`1d0d301`).
   Pre-first-push for the main consumer, so there is no remote reconciliation.
9. **Overview gains a `> **Name:**` handle** — the `feat-<slug>` string, so it
   can be copy-pasted straight into `/spec-go`. Added to the `/spec` template
   and `/spec-init`.

## Solution overview

The projection the engine emits collapses from
`{description, milestones[], tasks[], workflowState}` to:

```json
{
  "description": "<overview prose>",
  "workflowState": "in-progress",
  "subIssues": [
    { "ref": "01-outbox", "name": "Outbox", "goal": "…", "state": "in-progress" }
  ]
}
```

`planChanges` becomes `{ issue: { description, state, projectId? }, subIssues:
{ create: [...], update: [...] } }`. `/spec-push` applies it with
`create_issue` (spec issue, optional `projectId`) then `create_issue` with
`parentId` per phase, stamping `spec_identifier` / `linear_issue_id` back into
the files. Tasks never leave the repo.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `mapping` → `{specFolder:'issue', phases:'subissue', tasks:'none'}` |
| Config key | add | `linear.projectId` (optional grouping) |
| Config key | remove | `linear.initiativeId` |
| Config key | update | `states` semantics: Issue workflow states, not Project statuses |
| Config key | update | `sync.fieldOwnership` → `{description, subIssues, workflowState}` (drop `milestones`, `tasks`) |
| Domain object | update | projection: `milestones`+`tasks` → `subIssues[]`; drop task-issue items |
| Frontmatter | update | phase files: `linear_milestone_id` → `linear_issue_id` |
| Frontmatter | update | overview `spec_identifier` now = spec **issue** id |
| Snapshot | update | last-pushed snapshot format (spec-sync `record`) |
| CLI command | update | `spec-sync push --json` / `normalize` / `status` output shapes |
| Skill/rule | update | `/spec-push`, `/spec-status` MCP flow (issue + parented sub-issues) |
| Skill/rule | update | `/spec` template + `/spec-init`: add `> **Name:**` handle |
| Skill/rule | update | seam `spec-tracker-link` links a spec to an **issue** |
| Docs | update | READMEs, MIGRATION, docs/index.html to the Issue model |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config + projection reshaped to issue/sub-issue | ⬜ | [01-config-projection.md](01-config-projection.md) |
| 2 | Plan, snapshot & CLI on the new shape | ⬜ | [02-plan-snapshot-cli.md](02-plan-snapshot-cli.md) |
| 3 | `/spec-push` + `/spec-status` + seam rewritten to MCP issues | ⬜ | [03-push-status-skills.md](03-push-status-skills.md) |
| 4 | Naming handle, docs & 9.0.0 release | ⬜ | [04-naming-docs-release.md](04-naming-docs-release.md) |

## Open questions

- [ ] None — grilled to Ready. (Grouping edge: if `projectId` is set but the
      Project is archived, `/spec-push` should relay Linear's error and stop;
      captured as a Phase 3 task.)

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | Ready | backlog | Reuben Greaves |
| 2026-08-27 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-27 — Spec created. Chosen after a review of the whole spec↔Linear
  mapping prompted by the one-way redesign: spec=Issue, phases=sub-issues,
  tasks unsynced. Supersedes the narrower "only top-level tasks become issues"
  idea (that was still Project-centric).
