---
github_identifier: "#153"
github_url: "https://github.com/SkitterByte/skitterspec/issues/153"
---

# Epics — a spec of specs, ordered by what its members declare

> **Type:** Feature
> **Name:** feat-epics (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/153
> **Author:** Reuben Greaves
> **Raised:** 2026-11-10
> **Area:** packages/common/src/{cli.js,env/resolve.js}, packages/sync-core/src/{normalize.js,push.js}, packages/provider-kit/, packages/{github,linear,jira,azure-boards}/src/, skills (spec, spec-start, spec-next, spec-complete, spec-list), .claude/rules/spec-planning.md
> **Stack:** worktree

## Summary

A new `epic-` spec kind groups related specs. Each member declares what it
waits on; `skitterspec epic status` turns that into what can start now, what is
blocked and on what, and which pairs must never run at once because they edit
the same files — and every tracker shows the epic as its native parent.

## Problem

Related specs depend on each other and collide on shared files, and nothing
reads them together. Each spec records "depends on" in prose, so the order is
reconstructed by hand — reading every spec and grepping their areas — and lives
in a conversation. In skitterload on 2026-11-10 that took an agent reading
seven specs to produce a two-lane, four-wave plan with one phase-level sync
point (#159 phase 1 before #154 phase 2) and three never-together file sets;
the result had to be stored as an `issue-` spec ticked by hand
(`issue-library-and-sessions-plan`), the worked example for this spec.

## Acceptance criteria

- `/spec` can write an `epic-<name>` spec (`Type: Epic`): why, decisions, lane
  cap — no phase files.
- A member carries `> **Epic:** epic-<name>` and `> **Waits on:** <spec>[ phase N], …`.
- `skitterspec epic status <epic>` lists members by state, what is ready to
  start now, what is blocked and by which unmet wait, the waves, free lanes,
  and pairs whose `Area:` overlap — reproducing the skitterload plan from its
  members' headers alone.
- `/spec-start` on a member warns — never refuses — when a wait is unmet or an
  overlapping member is in flight.
- `/spec-complete` on an epic refuses while a member is open, naming each, and
  offers to complete with them listed.
- On GitHub, Linear, Jira and Azure Boards the epic is the members' native
  parent, set by the ordinary push.

## Decisions

1. **An epic is a spec kind**: `epic-` prefix, `Type: Epic`, a folder with
   `00-overview.md` and **no phase files** — its progress is its members'. It
   joins every lifecycle verb the way `incident-` did. *Rejected:* a members-
   only header with a generated view — nowhere to record why the order is what
   it is.
2. **Members declare membership and order; the epic declares neither.**
   `> **Epic:**` and `> **Waits on:**` live on each member, so a member read
   alone says what it waits for, and a wait may name a spec outside the epic.
   `Waits on` takes `<spec>` (landed) or `<spec> phase N` (that phase ✅ on the
   base branch). *Rejected:* an ordered table in the epic — the problem this
   exists to fix.
3. **A wait is met only on a positive signal** (`.claude/rules/negative-checks.md`):
   the named spec in `specs/complete/` on the base branch, or its phase heading
   ✅ there. A spec that cannot be found is **cannot-tell** — reported as such,
   never as met and never as blocked-forever.
4. **Collisions are computed from `Area:`, and only advise.** Pairs of members
   whose `Area:` globs intersect are "never together". `/spec-start` warns when
   one is started while its pair is in flight; nothing refuses, because Area is
   declared rather than measured. An optional `> **Lanes:** N` on the epic caps
   what `epic status` calls free.
5. **Waves are computed, not authored.** A topological layering of members by
   their waits; a member's lane is presentation. A cycle is reported, naming it,
   and never guessed through.
6. **All four trackers in this spec**, through one provider-kit seam —
   "set this issue's parent to the epic's": GitHub sub-issue (nesting keeps
   phases under each spec), Linear parent issue, Jira Epic (parent field), Azure
   Boards Epic (Epic → Feature/work-item hierarchy). The epic itself pushes like
   any spec, without phase sub-issues. A provider that cannot express the link
   says so on the push and carries on.
7. **An epic completes after its members.** `/spec-complete` refuses with open
   members (the incident pattern), and the operator may complete it with them
   listed as outstanding, recorded in its Changelog.

## Solution overview

```
member 00-overview headers         epic-<name>/00-overview.md
  > **Epic:** epic-x                   why · decisions · > **Lanes:** 2
  > **Waits on:** feat-a phase 1
  > **Area:** src/gen.ts, …
            │
skitterspec epic status epic-x
  members  ← every spec whose Epic: names it (all buckets, base branch)
  waits    ← positive signals only: complete bucket / ✅ phase heading
  waves    ← topological layers; cycle → reported
  clashes  ← pairwise Area: glob intersection
  → ready now · blocked (by what) · cannot-tell · waves · free lanes · clashes
push  → provider seam setParent(memberIssue, epicIssue)
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | add | `epic-` kind, `Type: Epic` (folder, no phases) |
| Config key | add | headers `Epic:`, `Waits on:`, `Lanes:` |
| CLI command | add | `skitterspec epic status <epic> [--json]` |
| Business rule | add | waits met on positive signals only; cycles reported |
| Business rule | add | Area-overlap pairs as advisory never-together |
| Skill/rule | update | `/spec` (Epic kind), `/spec-start` (warn), `/spec-next` (refuse on an epic), `/spec-complete` (open members), `/spec-list` (group by epic), `spec-planning.md` |
| Service | add | provider-kit seam `setParent` |
| Service | update | GitHub sub-issue · Linear parent · Jira Epic · Azure Epic links on push |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Epic kind and member headers | ✅ | [01-kind-and-headers.md](01-kind-and-headers.md) |
| 2 | `epic status`: waits, waves, ready-now | ⬜ | [02-epic-status.md](02-epic-status.md) |
| 3 | Area clashes and the start warning | ⬜ | [03-clashes.md](03-clashes.md) |
| 4 | Lifecycle skills | ⬜ | [04-lifecycle.md](04-lifecycle.md) |
| 5 | Tracker seam + GitHub | ⬜ | [05-seam-github.md](05-seam-github.md) |
| 6 | Linear, Jira, Azure Boards | ⬜ | [06-other-providers.md](06-other-providers.md) |

Phases 1–4 are useful with no tracker at all.

## Open questions

- None

## Changelog

- 2026-11-10 — Spec created from skitterload, where a seven-spec plan had to be
  worked out by hand and stored as an `issue-` spec
  (`issue-library-and-sessions-plan`, skitterload #162). That spec is the
  worked example and the first epic to convert.
- 2026-11-10 — Phase 1: an epic's "no phase files" is decided by its `epic-`
  prefix (`isEpic`), never by the absence itself — `readPhases` and `status`
  answer zero phases for an epic and still cannot-tell for any other kind.
  The providers' own kind maps (`specKindOf`, per-kind tracker types) are left
  to phases 5–6, where the epic's tracker type is decided; until then an epic
  pushes as a feature.
