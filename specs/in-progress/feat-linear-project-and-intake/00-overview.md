# Linear project selection & issue intake

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-08-27)
> **Name:** feat-linear-project-and-intake
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-27
> **Area:** packages/linear/src/{config,mcp,cli-sync}.js,
> packages/linear/assets/seams/, packages/linear/assets/skills/spec-push,
> packages/linear/assets/core/, packages/common/assets/skills/{spec,spec-bug}
> (seam markers only), packages/sync-core (regression test only), READMEs,
> MIGRATION.md, docs/index.html
> **Stack:** worktree

## Problem

`feat-spec-as-issue-mapping` makes a spec a Linear **Issue**, and groups spec
issues under one Linear Project named by a single global `linear.projectId`. One
umbrella project for every spec in a repo is too coarse — real work belongs to
the product Project it's part of, and that choice is per spec, made by the person
authoring it. There is no way to pick it, and no way to see what projects exist.

The other direction is missing entirely. Work arrives as Linear issues filed by
the web app (and by people), but the spec lifecycle only starts at a dev's
keyboard: the issue has to be re-typed into a spec by hand, and the reporter's
thread is orphaned from the work that answers it. We want to browse that inbox,
or name an issue by id, and start a spec **from** it.

Neither belongs in the spec file. Which Linear project an issue sits in is
Linear's business once the work is in flight — if a PM re-homes it, that must not
register as drift or get overwritten on the next push.

## Decisions

1. **The project is chosen, applied once, and never stored.** The picker runs when
   the spec issue is *minted* and `projectId` is passed on that create call only —
   never on an update, never written into the spec file or the snapshot. A PM
   moving the issue in Linear is therefore invisible to sync: nothing to drift,
   nothing to overwrite. The engine already works this way (`compare.js`: the plan
   omits `projectId`; the skill applies the grouping on top), so this decision is
   mostly *preserved* rather than built — the picker replaces the config read at
   `/spec-push` step 4.1. Rejected: a `linear_project_id` frontmatter field (turns
   a Linear-owned fact into repo state we'd have to reconcile).
2. **Two mint points, one picker.** `/spec` picks at link time; if Linear was
   unreachable (or sync was adopted later) the first `/spec-push` that creates the
   issue picks instead. One shared seam fragment, invoked from both. Rejected:
   `/spec`-only (leaves specs authored offline unable to ever choose) and
   push-only (an interactive prompt inside an otherwise mechanical skill).
3. **`linear.projectId` demotes from mandate to default.** Existing config keeps
   working: it pre-selects the picker's default instead of silently forcing every
   spec into one project. Blank = no default, "None (team only)" pre-selected.
4. **Picker = list + name filter + None.** Fetch the team's non-archived projects
   over MCP, narrow by a typed name fragment, always offer **None (team only)**.
   No "create a project" option — project lifecycle is the PM's surface, not the
   spec tool's. Rejected: creating projects (puts Linear org design into a dev CLI).
5. **Intake adopts the issue; it does not clone it.** A spec started from
   `SKI-123` *becomes* `SKI-123`: its identifier is stamped into
   `linear_identifier`, phases become its sub-issues, and push owns its description
   from then on. The reporter's comments, links, subscribers and history survive
   on the one issue everyone is already watching. The original body is seeded into
   the spec's **Problem** section, so replacing the description loses nothing.
   Rejected: mint a second issue and back-link (two issues per piece of work, and
   a manual close of the original).
6. **Adoption never touches the issue's project.** The picker is a mint-time
   thing; an adopted issue was filed somewhere deliberately and stays there. This
   is Decision 1 applied consistently — Linear owns placement.
7. **Two ways in, both through `/spec`.** `/spec <ISSUE-REF>` adopts any issue by
   id/identifier. `/spec --from-issue [query]` lists the **intake inbox** — issues
   carrying `intake.label`, minus any already adopted — and filters it by a name
   fragment when a query is given. Implemented as a new `spec-tracker-intake`
   seam so the base package is untouched. Rejected: a separate `/spec-from-issue`
   skill (duplicates arg handling and the grill flow for one extra command).
8. **Bug reports route to `/spec-bug`, which adopts identically.** An issue
   carrying one of `intake.bugLabels` is a bug: `/spec` says so and points at
   `/spec-bug <ISSUE-REF>` rather than authoring a Feature spec. `/spec-bug` gets
   the same intake seam. Most web-app-filed issues are bugs — the common path
   should land in the test-first skill.
9. **Dedup is repo-side and offline.** `skitterspec spec-sync linked --json`
   lists every `linear_identifier` stamped across `specs/` (reusing cli-sync's
   existing `identifierOf` reader); intake excludes those
   from the inbox and refuses a direct `/spec <ISSUE-REF>` that names one,
   pointing at the existing spec. No remote read, testable without MCP.
10. **Builds on `feat-spec-as-issue-mapping`; ships as
    `skitterspec-linear@9.1.0`.** Additive on top of 9.0.0 — new config keys, one
    new MCP op, one new seam. Base `skitterspec` gains only two seam markers.

## Solution overview

**Config** — additive to `linear.config.json`:

```jsonc
{
  "linear": { "teamId": "…", "projectId": "" },   // projectId now = picker default
  "intake": {
    "label": "web-app",                            // the inbox filter
    "bugLabels": ["bug", "defect"]                 // route these to /spec-bug
  }
}
```

**MCP boundary** (`packages/linear/src/mcp.js`) needs one new discovered op —
`projectList` — plus a `searchIssues({ label, query, teamId })` adapter method over
the already-discovered `issueList`. `issueRead` already exists (and is `REQUIRED`),
so `/spec <ISSUE-REF>` needs no new op. Both additions stay **optional**: a server
without `projectList` degrades to "picker unavailable, continuing without a
project" rather than failing the spec.

**Outbound flow** — `/spec` Phase E, and `/spec-push` step 4.1 when it mints:
list projects → filter → pick (default from `linear.projectId`) → pass `project`
on the `save_issue` create call only. Everything downstream is unchanged.

**Inbound flow** — `/spec ISS-123` or `/spec --from-issue [query]`:
resolve/search over MCP → drop already-adopted (`spec-sync linked`) → pick one →
read title/body/labels → if a `bugLabels` match, hand off to `/spec-bug` → else
seed the grill with the issue body, author the spec, stamp `linear_identifier` =
the issue's identifier, leave its project alone.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `intake.label`, `intake.bugLabels` |
| Config key | update | `linear.projectId` semantics: mandate → picker default |
| MCP op | add | `projectList` matcher + `listProjects()` / `searchIssues()` adapter |
| CLI command | add | `spec-sync linked --json` (adopted identifiers, offline) |
| Domain object | none | push plan unchanged — `projectId` is already skill-applied |
| Seam | add | `spec-tracker-intake` (fragment + markers in `/spec`, `/spec-bug`) |
| Seam | update | `spec-tracker-link` — project picker before minting |
| Skill/rule | update | `/spec-push` step 4.1 picks a project instead of reading config |
| Skill/rule | update | `/spec`, `/spec-bug` accept an issue ref / `--from-issue` |
| Docs | update | `linear.config.md`, SETUP.md, READMEs, docs/index.html |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config, MCP ops & the `linked` CLI | 🔄 | [01-config-mcp-linked.md](01-config-mcp-linked.md) |
| 2 | Project picker on mint (`/spec` + `/spec-push`) | ⬜ | [02-project-picker.md](02-project-picker.md) |
| 3 | Issue intake seam & adoption | ⬜ | [03-issue-intake.md](03-issue-intake.md) |
| 4 | Bug routing, docs & 9.1.0 release | ⬜ | [04-bug-routing-docs-release.md](04-bug-routing-docs-release.md) |

## Open questions

- [ ] None — grilled to Ready. `feat-spec-as-issue-mapping` landed on `main`
      (`67b1409`), so this is startable.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | Ready | backlog | Reuben Greaves |
| 2026-08-27 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-27 — Spec created. Grilled: project chosen per spec at mint time and
  never stored (so Linear owns placement); picker = list + filter + None, no
  creation; intake **adopts** the issue as the spec issue rather than cloning it;
  entry via `/spec <ref>` and `/spec --from-issue`, with `bugLabels` routing to
  `/spec-bug`; sequenced after feat-spec-as-issue-mapping as 9.1.0.
- 2026-08-27 — Reconciled against `feat-spec-as-issue-mapping` landing on `main`:
  frontmatter key is `linear_identifier` (not `spec_identifier`); `issueRead`
  already exists and is required, so only `projectList` is a new MCP op; and the
  engine already keeps `projectId` out of the plan/snapshot, so Phase 2 shrinks to
  swapping the config read for the picker plus a regression test.
