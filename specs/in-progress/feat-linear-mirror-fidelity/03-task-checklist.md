# Phase 3 — Project phase tasks as a sub-issue checklist ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a Linear sub-issue's description carries the phase's task list as a
read-only markdown checklist, gated by `mapping.tasks`; proven by projection
tests over both gate values.

## Tasks

- [ ] In `packages/linear/src/config.js`, flip the `mapping.tasks` default from
      `'none'` to `'checklist'` and document both values in the header comment.
      Validate the value (unknown → treat as `'none'`, or hard-error in line with
      `fieldOwnership`'s strictness — pick one and note it here).
- [ ] In `normalizeLocal` (`normalize.js`), when `config.mapping.tasks ===
      'checklist'`, append a `## Tasks` block to each sub-issue's `goal`:
      `- [ ]`/`- [x]` lines from `findTaskBlocks`, indentation preserved, inline
      `(KEY-123)` suffixes stripped via `parseTaskLine` (Decision 6).
- [ ] Confirm nothing downstream needs changing: `subIssueHash` already covers
      `goal`, so the checklist joins the diff and the plan for free. Verify by
      test rather than inspection.
- [ ] Tests in `packages/sync-core/test/`: `tasks: 'checklist'` yields the
      checklist in the sub-issue goal with checked/unchecked state and nesting
      intact; `tasks: 'none'` yields today's one-line goal; a legacy task line
      carrying `(SKI-7)` loses the suffix; a phase with no tasks gets no empty
      `## Tasks` heading.
- [ ] Add a test pinning the churn from Decision 7: a snapshot recorded before
      this change plans every sub-issue as `update` (not `create`) — the
      one-time re-push must not re-mint issues.
- [ ] Update `packages/linear/assets/core/linear.config.md` — its "Tasks are not
      synced" bullet is now wrong. Say tasks are **mirrored read-only** into the
      sub-issue description and are never read back.
- [ ] Update `/spec-push`'s and the `spec-tracker-link` seam's "tasks are not
      synced" wording to match.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Decision 7 (accepted churn): the first push after upgrading reports every
already-linked sub-issue as `update`. Worth a `Release-Note:` on the commit.

Tasks remain **one-way and read-only** — ticking a box in Linear is overwritten
on the next push, exactly like every other mirrored field.
