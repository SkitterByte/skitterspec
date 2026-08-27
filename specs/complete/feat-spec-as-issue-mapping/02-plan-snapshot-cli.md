# Phase 2 — Plan, snapshot & CLI on the new shape ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `planChanges`, the last-pushed snapshot, and the `spec-sync` CLI all
speak `{issue, subIssues}` — proven by compare/push tests and a CLI `--json`
snapshot test.

## Tasks

- [x] Rewrite `planChanges` in `packages/sync-core/src/compare.js` to emit
      `{ issue: { description, state, projectId? }, subIssues: { create: [...],
      update: [...] } }`. Sub-issues are keyed by `ref` (phase basename) for
      create and by `id` for update; a phase with a stamped `linear_issue_id`
      updates, else creates.
- [x] Replace `projectHash`/`milestoneHash`/`issueHash` with `issueHash`
      (description + state) and `subIssueHash` (name + goal + state). Keep
      `isEmptyPlan`, `stableStringify`, `hashField`.
- [x] Update `snapshotOf` / `base.js` to the new content shape so a re-`record`
      round-trips to an empty plan.
- [x] Update `push.js` `push()`/`projectionOf` to return the new projection and
      plan; `recordPush` writes the new snapshot.
- [x] Update `packages/linear/src/cli-sync.js` subcommands: `normalize` prints
      the new projection; `push --json` prints the new plan; `status` /
      `status --remote` report drift on `{issue, subIssues}`; `record` unchanged
      in interface. Remove any milestone/task-issue vocabulary.
- [x] Update `validateStates` callers to validate against **issue** workflow
      states (the workspace-states file now lists issue states).
- [x] Tests: `sync-compare`/`sync-push` (or equivalents) assert a fresh spec
      plans one issue + N sub-issue creates; a stamped spec with one changed
      phase plans exactly one sub-issue update; `record` → empty plan. Update
      `sync-realistic.test.js` fixtures to the new shape. Run typecheck + tests —
      green before the phase is done.

## Notes

Snapshot format changes, so any committed `specs/.core/linear-base/*` from the
old model would produce a spurious full re-create on first push after upgrade —
acceptable (pre-first-push), but note it in MIGRATION (Phase 4).

Done together with Phase 1 (projection + plan are one coupled change — the
compare/push tests can't go green on Phase 1 alone). Engine tests all green.

Two items deferred to Phase 3 (skill layer), out of scope for the engine:

- **Spec-issue identifier key.** The engine keys the snapshot on
  `frontmatter.linear_identifier` (unchanged) or the folder name. The spec's
  decision 7 said `spec_identifier`; reconcile to the one existing key
  (`linear_identifier`) when the skill stamps the created issue id, and fix the
  overview decision text — don't invent a second key.
- **Per-sub-issue remote drift.** `status --remote` reports spec-issue
  workflow-state drift (works — `remoteWorkflowState` reads an issue's `state`).
  Reading each sub-issue's remote state for per-phase drift is a larger
  `--remote` feature; leave it at spec-issue level for now.
