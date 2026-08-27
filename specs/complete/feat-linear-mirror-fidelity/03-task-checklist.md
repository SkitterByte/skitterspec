---
linear_issue_id: "SKI-25"
---

# Phase 3 — Project phase tasks as a sub-issue checklist ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a Linear sub-issue's description carries the phase's task list as a
read-only markdown checklist, gated by `mapping.tasks`; proven by projection
tests over both gate values.

## Tasks

- [x] In `packages/linear/src/config.js`, flip the `mapping.tasks` default from
      `'none'` to `'checklist'` and document both values in the header comment.
      Validate the value (unknown → treat as `'none'`, or hard-error in line with
      `fieldOwnership`'s strictness — pick one and note it here).
- [x] In `normalizeLocal` (`normalize.js`), when `config.mapping.tasks ===
      'checklist'`, append a `## Tasks` block to each sub-issue's `goal`:
      `- [ ]`/`- [x]` lines from `findTaskBlocks`, indentation preserved, inline
      `(KEY-123)` suffixes stripped via `parseTaskLine` (Decision 6).
- [x] Confirm nothing downstream needs changing: `subIssueHash` already covers
      `goal`, so the checklist joins the diff and the plan for free. Verify by
      test rather than inspection.
- [x] Tests in `packages/sync-core/test/`: `tasks: 'checklist'` yields the
      checklist in the sub-issue goal with checked/unchecked state and nesting
      intact; `tasks: 'none'` yields today's one-line goal; a legacy task line
      carrying `(SKI-7)` loses the suffix; a phase with no tasks gets no empty
      `## Tasks` heading.
- [x] Add a test pinning the churn from Decision 7: a snapshot recorded before
      this change plans every sub-issue as `update` (not `create`) — the
      one-time re-push must not re-mint issues.
- [x] Update `packages/linear/assets/core/linear.config.md` — its "Tasks are not
      synced" bullet is now wrong. Say tasks are **mirrored read-only** into the
      sub-issue description and are never read back.
- [x] Update `/spec-push`'s and the `spec-tracker-link` seam's "tasks are not
      synced" wording to match.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

**Unknown `mapping.tasks` is a hard error.** The task left this open. Chose the
loud option, matching `sync.fieldOwnership`'s existing precedent in the same
file: a typo quietly becoming `none` would strip every sub-issue's checklist and
look deliberate — precisely the silent degradation Phase 2 exists to stamp out.

**The shipped example config had to change too, and nearly didn't.** 
`assets/core/linear.config.json.example` is copied verbatim into a new project
and still pinned `"tasks": "none"`, which would have opted every new install out
of the new default while the code default said otherwise. Fixed, and guarded by
a new assets test that compares the example's `mapping` block against
`DEFAULT_CONFIG` so the two can't drift again.

**Test-fixture divergence, deliberate.** `packages/sync-core/test/_config.js`
still pins `tasks: 'none'`: most sync-core tests exercise goal *extraction*
(wrapped continuations, keying, push idempotency) and a checklist appended to
every goal would obscure them. The shipped default is covered where it belongs —
`sync-task-checklist.test.js` for the projection, and the linear package's
config + `engine-integration` tests end to end through the real loader.

**Churn measured on this repo, not estimated:** 3 linked specs, 11 sub-issue
updates, **0 creates**. No duplicate issues are minted, which was the risk worth
proving.

Decision 7 (accepted churn): the first push after upgrading reports every
already-linked sub-issue as `update`. Worth a `Release-Note:` on the commit.

Tasks remain **one-way and read-only** — ticking a box in Linear is overwritten
on the next push, exactly like every other mirrored field.
