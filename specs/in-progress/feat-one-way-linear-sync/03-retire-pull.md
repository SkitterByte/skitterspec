# Phase 3 — Retire pull, prune dead code, repurpose skills + config + docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the read-back seam is gone — content pull and its writers deleted, the
skills reflect one-way (repo owns), states validate loudly, and the suite is green
with less code than before. Ships as `skitterspec-linear@8.0.0`.

## Tasks

- [ ] Delete the content-pull path: `pull.js`, and the `write.js` pull-writeback
      writers (`updateTaskLine`, `addTaskLine`, `createPhaseFileForMilestone`,
      `writeMilestoneFields`, `applyTasksPull`, `applyMilestonesPull`,
      `findPhaseFileByMilestoneId/Title`). Remove `normalizeRemote` content
      projection; keep a minimal `remoteWorkflowState(project)` for the status
      report. Delete now-dead tests; keep push-side writeback tests.
- [ ] Repurpose `/spec-status` (skill + `spec-sync status`) to a **read-only
      drift report**: (a) *spec changed since last push* (local projection vs
      snapshot), and (b) *Linear workflow-state vs spec status* (scalar, via the
      skill's MCP read). Never writes. Wire `validateStates` here — a configured
      state name absent from the workspace fails loudly.
- [ ] Remove `/spec-pull` (skill dir + `spec-sync pull` subcommand + docs/refs).
      Update the `/spec-go` provider seam (`packages/common/assets`, `/spec-go`
      step 3b) from "pull first" to "push/report"; update `spec-planning.md`
      wording about the provider (`/spec-status`·`/spec-push`, no pull).
- [ ] Demote `spec-sanitise`: keep the command as an **optional cosmetic** tidy
      (hyphen fix already folded in Phase 1), and update its help + the authoring
      rule to say sync no longer depends on it. Add an `--exclude <glob>` option
      and skip `.gitignore`d paths (consumer report #7) while we're here.
- [ ] Docs + release: update `linear.config.json.example` (states + drop pull
      ownership notes), the provider README/skill docs (one-way model), and add a
      `Release-Note!` for the breaking change. Confirm `scripts/build-dist.js all`
      bundles cleanly and the base (tracker-free) build still emits no Linear
      brand text (`scripts/compose.test.js`).
- [ ] Cancel/fold the pending `hotfix-sanitise-hyphen-join` spec (its fix is
      absorbed here) and tear down its worktree.
- [ ] Full suite green (`node --test`) with the dead code removed; net line count
      down vs 7.x. Version bump prep for `skitterspec-linear@8.0.0` (breaking).

## Notes

Breaking surface for consumers: `/spec-pull` and `spec-sync pull` are gone, and
`spec-sync push` output shape changed (JSON plan). The `Release-Note!` must call
out the one-way model and that Linear is now a generated mirror (don't edit it
expecting a merge-back). Actual `npm version`/publish is operator-run at
`/spec-complete`, not here.
