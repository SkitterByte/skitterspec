---
linear_identifier: "SKS-115"
linear_url: "https://linear.app/skitterbyte/issue/SKS-115/list-specs-from-linear-id-title-state-and-who-holds-them"
---

# List specs from Linear — id, title, state and who holds them

> **Type:** Feature
> **Name:** feat-linear-spec-list (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 5 (started 2026-09-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-09
> **Area:** packages/linear/src/{api,mcp,cli-sync,config}.js, packages/linear/assets/skills/spec-list, packages/linear/assets/core/linear.config.md, packages/linear/test
> **Stack:** worktree

## Problem

There is no way to ask "what specs are there, and who is on them" without opening
Linear in a browser. The repo cannot answer it: `/spec-start` moves a spec to
`specs/in-progress/` **on that spec's own branch**, so on `main` an in-flight spec
still reads `backlog`, and a teammate's spec that has not landed yet is not on
disk at all. `ls specs/` is therefore wrong about the two things you most want to
know — what is actually in progress, and by whom.

Linear holds both, plus an ordered backlog the folder has no notion of. The sync
already reads Linear for drift (`/spec-status`); nothing yet reads it for a
*listing*, so the everyday questions — the next few in the backlog, what is
assigned to me, what is Jane on — have no answer at the terminal.

## Decisions

1. **Linear is the source for state, the repo for identity.** The listing queries
   Linear for what is live and who holds it, then joins the local
   `spec-sync linked` map to attach each spec's **folder name** — the handle you
   paste into `/spec-start`. *Rejected:* a purely local listing, which is blind to
   in-progress specs for the branch reason above.
2. **A parentless issue is the positive signal for "spec"; an unmatched one is
   reported, not hidden.** Phase sub-issues carry `parentId` and spec issues do
   not, so the discriminator is structural and needs no new write. An issue with
   no local match still appears, marked `— (not linked here)`: a missing local
   file is not evidence the issue is not a spec — a teammate's unlanded spec, or
   one authored inside another spec's worktree, is exactly what the listing exists
   to surface. See `.claude/rules/negative-checks.md`. *Rejected:* a `spec` label
   filter (a new write path plus a backfill of every existing spec issue before it
   tells the truth), and a strict local join (precise, and blind where Linear
   earns its keep).
3. **Default scope is live** — the states `config.states` maps `backlog` and
   `in-progress` to, read from that existing table rather than a new list.
   `--state <name>` and `--all` reach Done and Cancelled deliberately. In this
   workspace today that is the difference between 6 rows and 40+.
4. **No silent caps.** Both transports page and cap (Linear's MCP `list_issues`
   defaults to 50, max 250). Every listing prints what it did not show —
   `showing 5 of 23` — and `--next N` announces itself as a deliberate cap. A
   listing that implies completeness it never verified is the failure mode this
   command has to avoid.
5. **Archived issues are excluded, and the exclusion is stated in the output.**
   They are out of the live default by construction; `--archived` includes them
   for a `--state` query that is deliberately reaching into history. The blind
   spot is named rather than left for the reader to discover.
6. **Read-only. It acts on nothing.** Each row carries the spec folder name so
   `/spec-start <name>` is a copy-paste away, and the finish-up line says so.
   *Rejected:* offering to start the chosen spec — that welds a query onto a
   command which provisions branches, moves folders and commits, and would have to
   reproduce `/spec-start`'s dirty-tree refusals to be safe.
7. **`--next N` orders by Linear's own backlog order** — priority, then manual
   `sortOrder` — because reproducing what the Backlog view shows is the only
   reason to ask Linear rather than `ls specs/backlog/`. When every candidate has
   priority 0 (true of this workspace today) the skill says so: the order is a
   manual drag-order, not a ranking.
8. **The current phase appears on in-progress rows only**, as `2/5 — <title>`,
   taken from the phase sub-issue whose state is the in-progress one. It costs one
   sub-issue lookup per in-progress spec, of which there are rarely many, and
   answers "what is Jane actually on" without a second query. *Rejected:* a
   `--phases` full tree — a third output shape to design and test for a view
   rarely opened.
9. **Assignee filters reuse `feat-linear-assignment`'s identity, never a second
   copy.** `--mine` resolves through `spec-sync whoami`, `--by <user>` through
   `spec-sync users` (both from SKS-109 phase 1). On the MCP path Linear answers
   `assignee: "me"` directly and no identity is needed; the API path needs the id.
   This is the one part of the spec that cannot land before SKS-109 phase 1 —
   hence phase 5. Until assignment ships, nothing assigns spec issues, so the
   filters would return nothing even if built first.
10. **Degrade, never block.** Linear unreachable, or no credential → print the
    local listing from `spec-sync linked` under a one-line banner saying the
    states come from the repo and may be stale. A query command that fails closed
    is one you stop typing.
11. **Engine/skill split, following `states` and `projects`.** `spec-sync list`
    answers on the API path and prints `transport = mcp` otherwise; `/spec-list`
    carries the MCP call, the natural-language queries and the formatting. The
    skill is `disable-model-invocation: true`, like `/spec-status` and
    `/spec-push` — nobody reaches it except by typing it.

## Solution overview

One new engine verb and one new skill.

```
skitterspec spec-sync list [--state <name> | --all] [--next N] [--mine | --by <user>]
                           [--archived] [--limit N] [--json]
```

The verb resolves the transport exactly as `projects` does, queries Linear for
**parentless** issues in the team filtered by state, joins `listSpecs(dir, config)`
on `linear_identifier` to attach each spec's folder name and local bucket, and
prints one row per spec:

```
spec-sync list: transport = api, live (Backlog, In Progress) — showing 6 of 6

  SKS-109  Backlog      feat-linear-assignment
           Assign the Linear issue to the developer working the spec
  SKS-121  In Progress  feat-dark-mode          Jane Dev · 2/5 — Wire the toggle
           Dark mode for the settings page
  SKS-124  Backlog      — (not linked here)
           Reporter's raw intake issue
```

The API adapter gains one op, `listIssues({ teamId, stateIds, assigneeId, parentless, first, after })`;
the MCP boundary already matches an `issueList` operation (`list_issues`), so that
path needs no new matcher — only the arguments and the paging loop. `ISSUE_FIELDS`
gains `priority`, `sortOrder`, `assignee { id name }` and `parent { id }` so one
query answers every column.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync list [--state\|--all] [--next N] [--mine\|--by] [--archived] [--limit] [--json]` |
| CLI command | update | usage block gains the `list` line |
| Domain object | update | `ISSUE_FIELDS` gains `priority`, `sortOrder`, `assignee`, `parent` |
| Service | add | `adapter.listIssues(...)` on the API adapter; paged MCP `issueList` use |
| Skill | add | `/spec-list` — read-only team listing, user-invocable only |
| Docs | update | `assets/core/linear.config.md`, `assets/core/SETUP.md`, root `CLAUDE.md` skill table |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `spec-sync list` — the engine and the live listing | ✅ | [01-engine.md](01-engine.md) |
| 2 | `/spec-list` — the skill, MCP path and degradation | ✅ | [02-skill.md](02-skill.md) |
| 3 | `--next N` and Linear's backlog order | ✅ | [03-backlog-order.md](03-backlog-order.md) |
| 4 | The current phase on in-progress rows | ✅ | [04-current-phase.md](04-current-phase.md) |
| 5 | `--mine` / `--by <user>`, and docs | ✅ | [05-assignee-and-docs.md](05-assignee-and-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | Ready | backlog | Reuben Greaves |
| 2026-09-09 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-09 — Spec created.
- 2026-09-09 — Phase 1: two flag collisions surfaced that the spec had not
  anticipated. `--state` was already taken by `init-config` as a `bucket=name`
  pair, and `--all` by `apply --all <bucket>` as a value-taking flag — so
  `list --all --json` would have swallowed `--json` as the bucket. Resolved
  without changing either existing command: `--state` now also records its raw
  value in `flags.stateArgs` alongside the parsed pair, and `--all` is read as a
  boolean only when the subcommand is `list`.
- 2026-09-09 — Phase 1: paging lives inside `adapter.listIssues` rather than in
  the caller, and `first: null` means "everything". Linear's `IssueConnection`
  exposes no `totalCount`, so a truthful `showing 5 of 23` is only possible by
  fetching the matching set and capping for display — a caller-side page loop
  would have had to guess the total.
- 2026-09-09 — Phase 1: `docs/linear.html` gained its `spec-sync list` row now
  rather than in phase 5. The repo's `docs-claims` guard requires every
  dispatched verb to be documented on the engine's page, so the docs task could
  not wait for the phase that owns the rest of the docs. Its "used by" column
  says `you`, not `/spec-list` — that skill is phase 2 and does not ship yet,
  and a second guard rejects naming a skill the repo has not got.
- 2026-09-09 — Phase 2: Linear's MCP `list_issues` cannot express the filter the
  API path uses, in two ways the spec had assumed away. Its `state` takes a
  single name, not a list, so the live default is **two** calls merged and
  de-duplicated; and it can filter *to* a `parentId` but has no parentless
  filter, so the spec-vs-phase discriminator (decision 2) has to be applied
  locally on the returned rows — with `parentId` explicitly requested via
  `fields`, since it is absent from the default response. `/spec-list` documents
  both; the engine never meets them because its GraphQL `IssueFilter` does the
  work server-side.
- 2026-09-09 — Phase 2: no install-manifest edit was needed. `listSkills()` in
  `packages/common/src/init.js` discovers `assets/skills/*/SKILL.md` from the
  bundled tree, and `build-dist.js` overlays the provider's skills wholesale, so
  shipping the folder registers the skill. The task's real content was the
  assets test.
- 2026-09-09 — Phase 2: `docs/linear.html` again moved ahead of phase 5, for the
  same reason as phase 1. The `docs-claims` guard counts the skills the
  distribution ships and compares the figure to every "N skills installed" the
  site quotes, so adding the skill made the page's `14` false. Updated to `15`,
  and the `spec-sync list` row's "used by" cell now reads `/spec-list · you`
  because that skill exists as of this phase.
- 2026-09-09 — Phase 3: `--next N` **refuses** to combine with `--state`/`--all`
  rather than overriding them. It fixes the scope to the backlog itself, so the
  pair has no reading in which one flag does not silently lose — and a scope the
  user did not get is the same class of failure as a silent cap (decision 4).
  The refusal runs before any transport work, so it does not depend on whether
  an API key is set.
- 2026-09-09 — Phase 3: ordering is applied to the Linear issues **before** they
  are projected into display rows, and only under `--next`. The comparator needs
  `priority` and `sortOrder`, which the row shape never carried; leaving the
  plain listing unordered also keeps phase 1's `--json` contract byte-identical.
- 2026-09-09 — Phase 3: decision 7 is not reproducible over MCP, which the spec
  had not foreseen. Linear's `list_issues` cannot return `sortOrder` at all — it
  is absent from the tool's `fields` enum — and its `orderBy` offers only
  `createdAt`/`updatedAt`. The API path is therefore the only one that can print
  the real Backlog order; `/spec-list` orders by priority on the MCP path and
  prints a line saying the drag-order is unavailable, rather than letting the
  rows imply an order they do not have.
- 2026-09-09 — Phase 4: phase order is the sub-issue **identifier**, numerically
  — NOT `sortOrder`. The first implementation used `sortOrder` and passed every
  unit test, then printed `5/5` for this very spec sitting on phase 4. Linear's
  sub-issue `sortOrder` is a Backlog-view position and tracks nothing about the
  plan (SKS-115's phases 1-5 carry -105486, -108489, -109484, -5066, -10982).
  The fixtures now encode those real values with the live phase deliberately
  mis-sorted, so the mistake cannot pass again. Known blind spot, named in the
  code: a phase inserted mid-spec mints a higher identifier than its position.
- 2026-09-09 — Phase 4: the phase file called the non-sub-issue mode `section`;
  the config defines `subissue`, `deferred` and `inline`, and `inline` is the
  one meant. `phaseModeFor` is now exported from `sync-core` so the listing
  resolves the mode per bucket rather than assuming `subissue`.
- 2026-09-09 — Phase 4: a failed sub-issue lookup was not among the three shapes
  the phase enumerated, but it is a real one. It degrades the ROW — that row
  shows no phase and the listing names it once — rather than failing the whole
  command (`.claude/rules/negative-checks.md` rule 4).
- 2026-09-09 — Phase 4: the row now prints the **assignee** as well as the
  phase. The overview's example output shows it and the title of the spec
  promises it, but no phase's tasks had claimed it — `--mine`/`--by` in phase 5
  are filters, not display. It costs nothing: the field was already fetched.
- 2026-09-09 — Phase 5 was thought blocked on SKS-109 and was not. `spec-sync
  whoami`/`users` were absent from THIS BRANCH, which forked before
  `feat-linear-assignment` landed; they have been on `main` since. Reading that
  absence as "the verb does not exist" is the exact mistake
  `.claude/rules/negative-checks.md` opens with — the lookup was narrower than
  assumed. Rebasing onto main resolved it. Three textual conflicts (both sides
  added adapter methods, flag keys and skill tests) plus one semantic conflict
  git could not see - both branches added a skill, so the docs' "N skills
  installed" count moved without either edit conflicting.
- 2026-09-09 — Phase 5: the two assignee failures exit differently, on purpose.
  `--mine` with no resolvable identity exits **0** — a shared or bot key, or an
  offline machine, is an ordinary state, and `resolveIdentity` never prompts or
  writes. `--by` that matches nobody, or several, exits **1** — the argument is
  wrong and only the caller can fix it, which is the shape an unknown `--state`
  already had. Neither ever falls back to the whole team.
- 2026-09-09 — Phase 5: `--in-progress` was added; the phase's own example used
  it as if it existed. Adding it turned `--next`'s bespoke refusal into a general
  rule: the four scope flags are alternatives, and any two of them are refused
  before a transport is even chosen.
