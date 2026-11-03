---
github_identifier: "#85"
github_url: "https://github.com/SkitterByte/skitterspec/issues/85"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# `issue` and `incident` spec kinds, per-type states, incident log

> **Type:** Feature
> **Name:** feat-issue-incident-kinds
> **Status:** In Progress — Phase 1 (started 2026-11-03)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-11-03
> **Area:** packages/common (env/resolve.js, cli.js, assets/skills, assets/rules), packages/azure-boards, packages/github, packages/jira, packages/linear, packages/sync-core, docs/*.html
> **Stack:** worktree
> **Docs:** reference, azure-boards, github, jira, linear

Requested by the ereqs consumer repo:
`~/code/ereqs-wt/boards-work-item-kinds/specs/in-progress/feat-boards-work-item-kinds/handoff-skitterspec-issue-incident-kinds.md`
(read-only context; builds on `feat-chore-kind-bug-bodies`).

## Problem

ereqs runs four kinds of Boards work; skitterspec carries only `feat`, `bug`,
`hotfix` and `chore`. Two are missing: **`issue`** (non-code work — in-app
config, data fixes, support tasks — written as a spec of manual steps so there
is a record) and **`incident`** (an outage record, written during the outage,
whose fixes are separate linked specs). Today `issue-foo` silently resolves to
`{ type: 'feat', slug: 'issue-foo' }` and mints a User Story.

Separately, states are global per bucket: `stateFor(bucket)` reads
`config.states[bucket]` whatever the work item type
(`packages/azure-boards/src/cli-sync.js:166`). Azure's Issue type has no
Resolved state, so ereqs' `complete → Resolved` fails at write time; Incident
has no New, so a backlog push fails the same way. The pre-write check validates
against the **union** of all types' states (`unionStates`, cli-sync.js:377), so
a state one type lacks passes the check and produces exactly the half-applied
push the check exists to prevent. Jira has the same per-type reality (statuses
belong to the issue type's workflow); GitHub and Linear have one state set but
no way to complete one kind of spec to a different column.

## Decisions

1. **Two new kinds**: `issue` (prefix `issue-`, header `> **Type:** Issue`,
   branch `issue/<slug>`) and `incident` (prefix `incident-`, header
   `> **Type:** Incident`, branch `incident/<slug>`). Kind strings `issue` /
   `incident` everywhere. Unknown prefixes keep today's silent `feat` fallback,
   with a stays-silent test (`negative-checks.md` rule 3).
2. **`issue` has no new entry skill** — `/spec` proposes it alongside feature
   and chore ("no code change, manual steps → issue"). Phases are manual steps,
   not code; `/spec-start` still provisions a worktree (the document needs one
   and the history is the point). Defaults: `Gating: none: no code`, commits
   `docs` with no `Release-Note:`.
3. **`incident` gets `/spec-incident`** (like `/spec-bug`): its own grill —
   what is down, since when, who is affected, severity, what has been tried —
   then writes the spec straight into `specs/in-progress/` (it is written
   during the outage) with a `## Timeline` section appended to as the incident
   unfolds. Default gating `none: incident record, no code`.
4. **Incident fixes are separate specs, never child phases.** A fix spec (any
   kind) carries `> **Incident:** incident-<name>`; the push adds a one-way
   related link. The repo owns the link; nothing is read back.
5. **Per-type state overrides, keyed by what states vary by** (user's call,
   2026-11-03, all four providers): Azure and Jira get `statesByType` keyed by
   work item / issue type name (the handoff's exact Azure shape, e.g.
   `{ "Issue": { "complete": "Closed" }, "Incident": { "backlog": null, "complete": "Closed" } }`);
   GitHub and Linear have no types, so they get `statesByKind` keyed by spec
   kind. Each entry overrides `states[bucket]` for that type/kind; missing
   buckets fall through; **`null` sends no state**. Used everywhere `stateFor`
   and its MCP twins resolve a state.
6. **The pre-write check goes per-type.** Each type's *resolved* states are
   validated against **that type's** states, not the union; a type lacking a
   state it would be sent refuses before the first write, naming the type and
   the state. Configs whose resolved states exist on every mint type pass
   exactly as today; a config that would have failed mid-push now refuses
   up front — the new refusal is the fix, not a regression.
7. **Severity**: a `> **Severity:** <n> - <name>` header (Azure's literal
   values, `1 - Critical` … `4 - Low`) on incident specs (grilled by
   `/spec-incident`) and optionally on bug/hotfix specs. Push: Azure writes
   built-in `Microsoft.VSTS.Common.Severity` where the type has the field;
   GitHub/Linear map via opt-in `severityLabels` (digit → label name); Jira
   via opt-in `jira.severityField` (field id, value written verbatim). Unset →
   header stays repo-only, nothing pushed.
8. **Related links per provider**: Azure `System.LinkTypes.Related`; Jira a
   "Relates" issue link; Linear an issue relation; GitHub a
   "Related incident: #N" line in the generated fix-issue body (no typed link
   API; the cross-reference backlinks on the incident's timeline and is
   regenerated with every push, so nothing can clobber it).
9. **`/spec-complete` on an incident writes `incident-log.md`** in the spec
   folder — summary, severity, timeline (started/detected/mitigated/resolved),
   impact, root cause, the fixes (linked specs, tickets, releases), what went
   well/badly, follow-ups each offered as a `/spec`. It is pushed onto the
   incident item **as a comment** (user confirmed 2026-11-03): the description
   is the sync-owned mirror of the spec, so a log written there would be
   clobbered by the next push; comments are the one surface one-way sync never
   touches (same reasoning as `spec-sync preserve`).
10. **Incident completion refuses while a linked fix spec is still open** (in
    `backlog/` or `in-progress/`), and offers to complete anyway with that fix
    listed as outstanding — the operator answers, per
    `.claude/rules/offered-unblocks.md`'s spirit; the check is skill-level
    (grep for the `Incident:` header), not a new engine gate. Blind spot,
    named: a fix spec authored but not yet landed on the base branch is
    invisible to the grep — acceptable because `/spec`'s committing verdicts
    land authored specs on the base.
11. **Mid-incident board states are out of scope.** `statesByType` covers only
    bucket transitions (backlog/in-progress/complete/cancelled). Moving an
    Incident to Mitigated mid-flight, and consumer custom fields like
    `Custom.Mitigatedat`, stay manual on the board.
12. **Superset packages are not edit sites** — `scripts/build-dist.js`
    generates them; every change lands in the workspace packages.

## Solution overview

The kind vocabulary widens from four to six in the base engine (`splitPrefix`,
the spec-shaped argument check, branch naming) and the authoring surfaces
(`/spec` proposal, templates, rules tables). A new `/spec-incident` skill
mirrors `/spec-bug`'s shape: grill, write in-progress, with Timeline and
Severity sections. All four providers accept the new kinds in their kind→type
/ kind→label maps, gain per-type/kind state overrides with `null` = no state,
and validate resolved states per type before the first write. Push gains three
additive writes: the Severity field/label, the related link from a fix spec's
`Incident:` header, and (at completion) the incident log as a comment.
`skitterspec update` delivers the new skill and rule text; MIGRATION notes list
the consumer config to add.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Kind vocabulary | add | `issue`, `incident` (`splitPrefix`, cli spec-shaped check, branch naming) |
| Skill | add | `/spec-incident` |
| Skill | update | `/spec` (proposes issue), `/spec-complete` (incident log, open-fix refusal) |
| Spec headers | add | `> **Severity:**`, `> **Incident:**` |
| Config key | add | `azure.statesByType`, `jira.statesByType`, `github.statesByKind`, `linear.statesByKind` (null = send no state) |
| Config key | add | `github.severityLabels`, `linear.severityLabels`, `jira.severityField` |
| Config key | update | all four kind maps accept `issue` / `incident` keys |
| Business rule | update | pre-write state check validates per type, not against the union |
| Push | add | severity write, related link (Azure/Jira/Linear typed, GitHub body line), incident-log comment |
| Doc | add | `incident-log.md` written into the spec folder at completion |
| Docs pages | update | reference, azure-boards, github, jira, linear; MIGRATION notes |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Base kinds in the engine | ⬜ | [01-base-kinds.md](01-base-kinds.md) |
| 2 | Provider kind mappings | ⬜ | [02-provider-kind-mappings.md](02-provider-kind-mappings.md) |
| 3 | Per-type state overrides + per-type pre-write check | ⬜ | [03-per-type-states.md](03-per-type-states.md) |
| 4 | Authoring surfaces: issue proposal + /spec-incident | ⬜ | [04-authoring-surfaces.md](04-authoring-surfaces.md) |
| 5 | Severity + related links on push | ⬜ | [05-severity-related-links.md](05-severity-related-links.md) |
| 6 | Incident log at completion | ⬜ | [06-incident-log.md](06-incident-log.md) |
| 7 | Migration notes, docs sweep, shipping checks | ⬜ | [07-ship.md](07-ship.md) |

## Open questions

- None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-03 | Ready | backlog | Reuben Greaves |
| 2026-11-03 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-11-03 — Spec created from the ereqs handoff. User decisions: all four
  providers get the state/severity/link machinery (not Azure-only); one
  combined spec; incident log pushed as a comment; state overrides keyed by
  type on Azure/Jira and by kind on GitHub/Linear.
