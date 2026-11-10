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
> **Docs:** reference, github

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
- A member carries `> **Epic:** epic-<name>` and `> **Waits on:** <spec>[ phase N], …`
  on its overview (what its start waits for), and any of its phase files may
  carry its own `> **Waits on:**` (what that phase waits for).
- `skitterspec epic status <epic>` lists members by state, what is ready to
  start now, what is blocked and by which unmet wait, the waves, free lanes,
  and pairs whose `Area:` overlap — reproducing the skitterload plan from its
  members' headers alone.
- `/spec-start` on a member, and `/spec-next` before building a member's
  phase, consult its epic: an unmet wait warns and offers to proceed, recorded
  when taken — never a silent build, never a hard refusal. `/spec-start` also
  warns when an overlapping member is in flight.
- When a landing's rebase brings in a phase another phase of this spec waits
  on, that phase's tests are re-run before the fast-forward.
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
   base branch). **Dependencies are per phase on both sides**: the overview's
   `Waits on:` holds the spec's start, and a phase file's own `Waits on:` holds
   only that phase — the field example's real edge was *#154 phase 2 waits on
   #159 phase 1*, which spec-to-spec links cannot express. A phase wait never
   moves a wave; it is reported as a sync point. *Rejected:* an ordered table
   in the epic — the problem this exists to fix.
3. **A wait is met only on a positive signal** (`.claude/rules/negative-checks.md`):
   the named spec in `specs/complete/` on the base branch, or its phase file
   reading done there — the phase's own landed commit, since a phase is marked
   done in the commit that builds it. A spec that cannot be found is
   **cannot-tell** — reported as such, never as met and never as
   blocked-forever. `Refs:` trailers name a spec, not a phase, so they cannot
   answer a phase wait and are not what decides one.
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
8. **The rule is checked where the work happens.** In the field the sync point
   sat in the coordination spec while `/spec-next` in #154's worktree — which
   never read it — built phase 2 anyway (d373158 before 8159b15). So a member's
   `/spec-start` and `/spec-next` ask `skitterspec epic check` before building:
   an unmet wait **warns and offers to proceed** as a `bypass`
   (`.claude/rules/offered-unblocks.md`) — the operator answers, the choice is
   recorded, it is offered once per phase. Cannot-tell warns without an offer
   and carries on. *Rejected:* refusing — the operator may know an edge does not
   matter for this phase.
9. **A rebase satisfies the order, not the intent.** Fast-forward-only landing
   rebased #154 onto #159 before it reached main (cb20cae, phase 2 rebased to
   3acd42d over 43463b3), but nothing re-ran #154's tests with the safety rules
   underneath. So when a landing's rebase moves a wait from unmet at the old fork
   point to met on the new base, the landing re-runs that phase's tests before
   it fast-forwards. That comparison is the positive signal: it needs no record
   of how the phase was built.
10. **An epic holds no check it cannot observe.** Progress is derived — member
    state from buckets, phase state from phase files on the base branch — and an
    epic has no checklist of its own to tick. Nothing reads CI: the field plan's
    "confirm main green after each land" could not be ticked with no `gh`
    installed, and a check that cannot be read is a check that silently
    passes.

## Solution overview

```
member 00-overview headers         epic-<name>/00-overview.md
  > **Epic:** epic-x                   why · decisions · > **Lanes:** 2
  > **Waits on:** feat-a phase 1
  > **Area:** src/gen.ts, …
member 02-<phase>.md
  > **Waits on:** feat-b phase 1      (holds this phase only)
            │
skitterspec epic status epic-x
  members  ← every spec whose Epic: names it (all buckets, base branch)
  waits    ← positive signals only: complete bucket / ✅ phase heading
  waves    ← topological layers of start waits; cycle → reported
  syncs    ← phase-level waits, each met / not yet / cannot tell
  clashes  ← pairwise Area: glob intersection
  → ready now · blocked (by what) · cannot-tell · waves · free lanes · clashes
epic check <member> [--phase N]  ← /spec-start, /spec-next: warn + bypass offer
land: rebase moved a wait unmet → met  → re-run that phase's tests, then ff
push  → provider seam setParent(memberIssue, epicIssue)
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | add | `epic-` kind, `Type: Epic` (folder, no phases) |
| Config key | add | headers `Epic:`, `Waits on:` (overview and phase files), `Lanes:` |
| CLI command | add | `skitterspec epic status <epic> [--json]`, `skitterspec epic check <spec> [--phase N] [--json]` |
| Business rule | add | unmet wait at build time → warn + bypass offer, recorded |
| Business rule | add | a wait met by a landing's rebase → re-run that phase's tests before ff |
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
| 2 | `epic status`: waits, waves, ready-now | ✅ | [02-epic-status.md](02-epic-status.md) |
| 3 | Area clashes and the start warning | ✅ | [03-clashes.md](03-clashes.md) |
| 4 | Lifecycle skills | ✅ | [04-lifecycle.md](04-lifecycle.md) |
| 5 | Tracker seam + GitHub | ✅ | [05-seam-github.md](05-seam-github.md) |
| 6 | Linear, Jira, Azure Boards | ⬜ | [06-other-providers.md](06-other-providers.md) |
| 7 | Re-verify a wait met by rebase | ⬜ | [07-reverify-on-rebase.md](07-reverify-on-rebase.md) |

Phases 1–4 and 7 are useful with no tracker at all; 7 depends on nothing in 5–6
and may be built before them.

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
- 2026-11-10 — Field evidence from the worked example (skitterload #162):
  #154 phase 2 was built before #159 phase 1 landed, because `/spec-next` in
  #154's worktree never read the plan; fast-forward-only landing rebased it
  onto #159 but nothing re-ran its tests. Folded in as Decisions 2 (phase-level
  `Waits on:` in phase files), 3 (why phase files, not `Refs:`), 8 (build-time
  check with a recorded bypass offer), 9 (re-verify a wait met by rebase) and
  10 (derived progress, no unobservable checks); phase 4 gains `epic check`,
  and phase 7 is new. With the phase-level edge the plan reproduces exactly:
  #154 and #159 share wave 1.
- 2026-11-10 — Phase 3: `epic check <spec>` was introduced here for the clash
  warning, so `/spec-start` asks one engine verb; phase 4 extends the same verb
  with unmet waits and the bypass offer rather than adding a second call.
- 2026-11-10 — Phase 4: `/spec-list` grouping moved to phases 5–6 — it reads
  the tracker, so it can group only once the parent link exists. `epic bypass`
  joined `epic check` as the recorded way past a wait.
- 2026-11-10 — Phase 5: a member's pushed description carries an `Epic:` line
  (the related-incident precedent), so gaining the header always yields a push
  for the parent link to ride on. GitHub's `list` had to stop treating every
  sub-issue as a phase.
