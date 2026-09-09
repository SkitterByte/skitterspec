---
linear_identifier: "SKS-103"
linear_url: "https://linear.app/skitterbyte/issue/SKS-103/bug-a-lost-stamp-mints-a-duplicate-sub-issue"
---

# Bug: a lost stamp mints a duplicate sub-issue

> **Type:** Bug
> **Name:** bug-lost-stamp-duplicates (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixed (test green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-09
> **Area:** packages/sync-core/src/compare.js, packages/sync-core/test
> **Stack:** worktree

## Symptom

A phase whose `linear_issue_id` stamp goes missing is pushed as a **new**
sub-issue, silently duplicating the one it already had and orphaning it on the
board.

Observed today on `SKS-97`. Phase 4 (`04-handoff.md`) was stamped
`linear_issue_id: "SKS-101"` by an earlier apply. The file was then rewritten in
place — a whole-file overwrite rather than a patch — which discarded the
frontmatter. The next push planned that phase as a create:

```
spec-sync apply: transport = api
  issue updated: SKS-97
  sub-issue created: 04-handoff → SKS-102
```

`SKS-101` was left parented to the spec, claimed by no phase, and had to be
cancelled by hand.

A file rewrite is only the easiest way in. A hand edit, a bad merge, or any tool
that writes the whole file loses the stamp just as well.

## Root cause

`planChanges` in `packages/sync-core/src/compare.js:110` decides between create
and update on `s.id == null` alone:

```js
for (const s of p.subIssues || []) {
  if (s.id == null) {
    subIssues.create.push({ ref: s.ref, name: s.name, goal: s.goal, state: s.state })
  } else if (snapS[String(s.id)] !== subIssueHash(s)) {
```

Two states where there are three. "No stamp" is read as **"this phase is new"**,
when it equally means **"the stamp was lost"** — and the planner is holding the
evidence that distinguishes them. The snapshot it diffs against still lists the
sub-issue ids from the last push (`snap.subIssues`, keyed by identifier), so an
id that no local phase claims, sitting beside a phase with no id, is the
signature of a lost stamp.

This is the failure `.claude/rules/negative-checks.md` describes: an **absence**
treated as evidence. What blinded the lookup is that nothing else in the push
path re-reads the tracker, so the snapshot is the only memory of what was already
minted — and it was never consulted before minting.

## Failing test (red)

`packages/sync-core/test/sync-lost-stamp.test.js` — run with
`node --test packages/sync-core/test/sync-lost-stamp.test.js`.

Five tests: two for the bug, three that must **stay silent** (a genuinely new
phase, a first push with no snapshot, a deleted phase). Red output:

```
✖ an unstamped phase beside an unclaimed snapshot id does not mint
  AssertionError: a lost stamp must not become a second sub-issue
✖ the ambiguity is reported, not silently swallowed
ℹ pass 3  ℹ fail 2
```

## Fix

- [x] Give `planChanges` the third state: when a phase has no id **and** the
      snapshot holds sub-issue ids no phase claims, do not plan a create.
- [x] Report it instead — `plan.unstamped` lists each such phase with the
      candidate ids it could be — so the operator can re-stamp rather than guess.
- [x] Keep creating when there is no ambiguity: a fully-claimed snapshot (a
      genuinely new phase) and no snapshot at all (an unlinked spec's first push).
- [x] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [x] Surface `plan.unstamped` in the push/apply CLI output so it is not silently
      swallowed by a caller reading only `create`/`update`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | update | `plan.unstamped` added to the push plan |
| CLI command | update | `spec-sync push` / `apply` report unstamped phases |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-09 — Bug reproduced; failing test added (red).
- 2026-09-09 — Fixed: `planChanges` gains a third state — an unstamped phase
  beside an unclaimed snapshot id is reported as `plan.unstamped`, not minted.
  Test green; full suite 1440/1440.
- 2026-09-09 — The report is emitted **outside** the empty-plan branch. A plan
  carrying only unstamped phases is empty for applying, so `isEmptyPlan` says
  "up to date" — printing the warning inside that branch would have hidden the
  one thing needing action. Verified by unstamping a real phase file: the status
  reports both lines together.
- 2026-09-09 — Found while provisioning this spec: `/spec-bug` §2 still tells
  you to `mv` the stub into the worktree to keep `main` pristine, which the new
  `spec-env up` gate contradicts by committing it. Agreed to drop the `mv` and
  its `mkdir -p` hazard; **not fixed here** — a separate change, and this commit
  belongs to one spec.
