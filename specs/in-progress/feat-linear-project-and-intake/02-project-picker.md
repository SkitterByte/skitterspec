# Phase 2 — Project picker on mint ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the person authoring a spec picks its Linear Project from a searchable
list at the moment the issue is minted, replacing the silent
`config.linear.projectId` read — with a test proving a Linear-side move still
produces no drift.

## Tasks

- [ ] Write the picker as a reusable block in
      `packages/linear/assets/seams/spec-tracker-link.md`: list the team's
      non-archived projects via `listProjects(teamId)`, narrow by a typed name
      fragment, always offer **None (team only)**, pre-select `linear.projectId`
      when set.
- [ ] Make the picker degrade, never block: if Linear is unreachable or
      `projectList` wasn't discovered, say so and continue — the spec is written
      local-only and `/spec-push` picks later.
- [ ] Update the seam's **Create the Issue** step to pass the picked `project`
      instead of unconditionally attaching `linear.projectId`.
- [ ] Update `/spec-push` step 4.1
      (`packages/linear/assets/skills/spec-push/SKILL.md`) the same way: run the
      picker only on the create path (no `linear_identifier` yet); the update path
      must never send `project`. Keep the existing archived-project error clause.
- [ ] Add a regression test in `packages/sync-core` asserting `projectId`/`project`
      appears in neither `planChanges` output nor `snapshotOf` — the invariant the
      engine already satisfies, now pinned so a later change can't leak it.
- [ ] Add/extend tests: a re-push after a simulated Linear-side project move
      produces an empty plan. Run the project's typecheck and test commands —
      green before the phase is done.

## Notes

The engine is already correct here — `compare.js` deliberately omits `projectId`
and lets the skill apply grouping on top. This phase is a skill/seam change plus
the test that stops that property from silently regressing.
