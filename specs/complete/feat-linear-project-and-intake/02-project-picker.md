---
linear_issue_id: "SKS-19"
---

# Phase 2 — Project picker on mint ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the person authoring a spec picks its Linear Project from a searchable
list at the moment the issue is minted, replacing the silent
`config.linear.projectId` read — with a test proving a Linear-side move still
produces no drift.

## Tasks

- [x] Write the picker as a reusable block in
      `packages/linear/assets/seams/spec-tracker-link.md`: list the team's
      non-archived projects via `listProjects(teamId)`, narrow by a typed name
      fragment, always offer **None (team only)**, pre-select `linear.projectId`
      when set.
- [x] Make the picker degrade, never block: if Linear is unreachable or
      `projectList` wasn't discovered, say so and continue — the spec is written
      local-only and `/spec-push` picks later.
- [x] Update the seam's **Create the Issue** step to pass the picked `project`
      instead of unconditionally attaching `linear.projectId`.
- [x] Update `/spec-push` step 4.1
      (`packages/linear/assets/skills/spec-push/SKILL.md`) the same way: run the
      picker only on the create path (no `linear_identifier` yet); the update path
      must never send `project`. Keep the existing archived-project error clause.
- [x] Add a regression test in `packages/sync-core` asserting `projectId`/`project`
      appears in neither `planChanges` output nor `snapshotOf` — the invariant the
      engine already satisfies, now pinned so a later change can't leak it.
- [x] Add/extend tests: a re-push after a simulated Linear-side project move
      produces an empty plan. Run the project's typecheck and test commands —
      green before the phase is done.

## Notes

The engine is already correct here — `compare.js` deliberately omits `projectId`
and lets the skill apply grouping on top. This phase is a skill/seam change plus
the test that stops that property from silently regressing.

**The picker needed a build change to be single-sourced.** Decision 2 calls for
one shared fragment invoked from both mint points, but the two live on opposite
sides of the composer: `/spec` is a *common* skill filled from seam fragments,
while `/spec-push` is a *Linear-only* skill that `build-dist.js` overlaid
byte-for-byte — a marker there would have shipped raw. Nesting a marker inside the
`spec-tracker-link` fragment doesn't work either (`composeText` is a deliberate
single pass, and making it recursive would break the "deliberately dumb" contract
that file states outright). So the picker became its own seam,
`spec-project-picker`, marked in **common's `/spec`** and in **`/spec-push`**, and
`overlayTree` now routes provider assets through `composeAssets` — the same
substitution common's get. Composing a file with no markers is a no-op, so nothing
else changed. A new guard test fails the build if a provider skill uses a seam the
provider doesn't supply.
