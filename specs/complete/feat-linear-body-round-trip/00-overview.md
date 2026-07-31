---
linear_project_id: "77703991-f1de-4f15-bf69-3872f45baf28"
linear_identifier: "SKI-body-round-trip"
linear_url: "https://linear.app/skitterspec/project/linear-body-round-trip-phasesmilestones-tasksissues-ca3029784e1d"
spec_status: "backlog"
last_synced_at: "2026-07-30T09:09:08.685Z"
priority: 0
---

# Linear body round-trip: phases↔Milestones, tasks↔Issues

> **Type:** Feature
> **Status:** Complete (2026-07-31)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-30
> **Area:** packages/sync-core/src/{compare,normalize,apply,pull,push,write}.js, packages/linear/src/{mcp,config}.js, packages/linear/assets/core/*
> **Stack:** worktree

## Problem

Linear hybrid-sync (fixed in `bug-linear-live-sync`) round-trips only the project
`description` — the whole spec body as one blob — plus pull-owned
status/priority/labels. A spec's **phases** and **tasks** have no first-class
presence in Linear: you can't see phases as Milestones, tick a task off in Linear
and have it reflect locally, or edit a phase goal in Linear and pull it back into
the right phase file. This is the deferred gap the earlier fix named. Closing it
makes the repo↔Linear surface genuinely collaborative at the granularity people
actually work in.

## Decisions

1. **Scope: full hierarchy.** Phases ↔ Linear **Milestones** and tasks ↔ Linear
   **Issues**, both bidirectional. (Rejected milestones-only / read-only — we want
   the real dogfood and the engine work is shared.)
2. **Identity by explicit id, not name/order.** Each phase file stores its
   `linear_milestone_id` in frontmatter; each task line carries its issue
   identifier inline (`- [ ] do the thing (SKI-123)`). Survives renames/reorders,
   is human-visible and git-diffable. (Rejected a hidden sidecar id-map — invisible
   and brittle on task text edits; rejected name/order matching — mismaps on any
   rename.)
3. **Task semantics.** Task **text** is co-authored (`both`). **Completion** maps
   **binary**: `[x]` ↔ issue in a `completed`-type state, `[ ]` ↔ any non-completed
   state; both directions. Issue assignee / priority / exact workflow state stay
   **Linear-owned** and are not represented locally. (Rejected representing full
   issue state inline — bloats task lines, breaks the checkbox model.)
4. **Milestone semantics.** Milestone **name** ← phase title, **description** ←
   phase goal; both co-authored. Milestone `progress` is Linear-derived
   (read-only, not stored locally — a real Linear milestone has no workflow state,
   only a %).
5. **De-duplicate the description.** When milestone sync is active, the `Phases`
   section is stripped from the pushed project `description` (like
   `localOnlySections`), so phases live as Milestones, not twice.
6. **Per-item three-way merge.** The engine compares id-keyed collection items
   individually (local/remote/base per item), so an edit to milestone A locally and
   milestone B in Linear both apply. (Rejected whole-field compare — any single
   edit conflicts the entire collection.)
7. **Deletions are report-only in v1.** Adds and edits round-trip automatically; a
   phase/milestone or task/issue removed on either side is reported as a divergence
   for manual resolution — never auto-deleted. (Revisit propagation in a follow-up.)
8. **Opt-in.** The new synced fields (`milestones`, `phaseBodies`/`taskBreakdown`)
   are added to `sync.fieldOwnership` behind the existing config — a workspace opts
   in; the `bug-linear-live-sync` default (description + status/priority/labels)
   stays the safe baseline.

## Solution overview

- **Engine (sync-core):** generalize the three-way compare so a field may be a
  **keyed collection** — items with a stable `id` compared/merged per item, giving
  per-item `added`/`edited`/`removed`/`conflict` outcomes — alongside today's
  scalar/whole-field fields. `classify` and the pull/push orchestration consume the
  per-item outcomes; the base sidecar stores items keyed by id.
- **Denormalizer (write.js):** today only frontmatter is written back. Add a
  **body writer** that applies pulled milestone edits (name/goal) into the matching
  phase file's frontmatter/heading, pulled task edits (text/checkbox) into the
  matching task line, creates a new phase file for a new milestone, and stamps the
  inline issue identifier / phase `linear_milestone_id`.
- **Linear adapter (mcp.js):** already has milestone create/update; add milestone
  **read/list** and full **issue** ops (list/create/update, `save_issue` upsert
  keyed on `id`, keyed to the project/milestone). Real milestone shape is
  name/description/progress; real issue completion is `state.type === 'completed'`.
- **Mapping:** phase-file frontmatter gains `linear_milestone_id`; task lines gain
  a trailing `(TEAM-123)`. Parsing tolerates its presence/absence so unlinked specs
  are unaffected.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Per-item (id-keyed) three-way merge in sync-core | ✅ | [01-keyed-merge-engine.md](01-keyed-merge-engine.md) |
| 2 | Phases ↔ Milestones round-trip + phase-file denormalizer | ✅ | [02-phases-milestones.md](02-phases-milestones.md) |
| 3 | Tasks ↔ Issues round-trip (inline ids, binary done-state) | ✅ | [03-tasks-issues.md](03-tasks-issues.md) |
| 4 | Opt-in config, deletion-divergence reporting, docs | ✅ | [04-enablement-and-docs.md](04-enablement-and-docs.md) |

## Open questions

- [ ] **Deferred to a follow-up spec:** deletion **propagation** (beyond
      report-only) — once report-only has proven the identity model in real use.
- [x] Phase-file naming/numbering for a Linear-created milestone — **resolved:**
      `createPhaseFileForMilestone` appends as the next phase number
      (`NN-<slug>.md`). Insertion *between* existing phases isn't renumbered
      (append-only); acceptable for v1, folds into the deletion/reorder follow-up.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-30 | Ready | backlog | Reuben Greaves |
| 2026-07-30 | In Progress | in-progress | Reuben Greaves |
| 2026-07-31 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-07-30 — Spec created; scope and identity/merge/deletion decisions locked in
  Phase A grilling. First real dogfood of the Linear sync process.
- 2026-07-30 — Phase 1 done: `sync.keyedFields` config marker + per-item (id-keyed)
  three-way classifier in `compare.js` (`classifyItems`), scalar path unchanged.
  12 keyed fixtures + config tests; suite 256 green. **Deviation:** pull/push
  item-*application* moved to Phase 2 (inseparable from the adapter/denormalizer);
  Phase 1 exposes per-item outcomes for Phase 2 to consume.
- 2026-07-31 — Completed; all 4 phases done, tests green (282/282), both
  milestone and issue round-trips live-verified. Deferred (by design): deletion
  *propagation* beyond report-only (follow-up spec).
- 2026-07-31 — Phase 4 **complete** (finale): `sync.keyedFields` documented opt-in
  (default off); `/spec-status` surfaces report-only removals; SETUP.md,
  linear.config.md ("Body round-trip" section) and README updated, "planned
  extension" caveat removed; bug-linear-live-sync deferred note points here. Suite
  282 green. **All four phases done — spec ready for /spec-complete.**
- 2026-07-31 — Phase 3 **complete** (3b write-side): `write.js` task-line
  denormalizer (update/add/stamp/applyTasksPull); `pull.js` dispatches milestones
  vs tasks; `push.js` keyed plan generalized to emit `issuesPush`; `/spec-push`
  and `/spec-pull` skills apply/fetch issues. Denormalizer + pull + push fixtures.
  **Live shape check caught** real issues use flat `statusType`/`id=identifier`
  (not `state.type`) — fixed `normalizeRemote` + regression test. Suite 282 green.
  Both tasks↔issues directions modeled; push writes go through the skill (as with
  milestones).
- 2026-07-31 — Phase 3a (read-model) done: `parseTaskLine` + keyed `tasks` field
  of `{id,text,done}` (inline `(SKI-123)` id, checkbox → done); `normalizeRemote`
  maps issues to the same shape; adapter gains `listIssues`/`createIssue`/
  `updateIssue`. 4 fixtures; suite 275 green. Phase 3 splits 3a (read) + 3b (write).
- 2026-07-31 — Phase 2 **complete** (push-side): `push.js` emits a `milestonesPush`
  create/update plan the `/spec-push` skill applies via `save_milestone` (stamping
  new ids; base self-heals). 3 push-plan fixtures + a live push smoke (local goal
  edit → plan → Linear milestone updated → in sync). Full bidirectional milestone
  round-trip works. Suite 271 green.
- 2026-07-30 — Phase 2b (write-side, pull direction) done: `write.js` phase-file
  denormalizer, `pull.js` applies keyed milestone edits into phase files + creates
  new ones + reports removals, item-level conflict detection in pull/push, goal
  label-strip for hash-equality, CLI surfaces keyed applies. Denormalizer +
  pull-integration fixtures and a **live pull smoke** (edited a milestone in
  Linear → pull → phase file updated → in sync). Suite 268 green. **Deferred:**
  push-side milestone create/update (repo→Linear) — a provider-skill MCP step, not
  the offline engine; the remaining Phase 2 task.
- 2026-07-30 — Phase 2a (read-model) done: milestones normalize to keyed
  `{id,name,goal}` from phase-file frontmatter/titles (local) and Linear milestones
  (remote); `buildDescription` strips `Phases` when keyed; adapter gains
  `listMilestones`. Suite 260 green. **Phase split:** Phase 2 is delivered as 2a
  (read-model, this commit) + 2b (denormalizer + push/pull application + live
  smoke, next). Milestone `status` field dropped from normalization (progress is
  Linear-derived, not synced) — updated the bug-fix regression test accordingly.
