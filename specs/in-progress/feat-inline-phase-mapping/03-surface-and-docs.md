# Phase 3 — Surface it: CLI, skills, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** someone reading a push or a status report can tell which phase mode
applied and why, and the config is documented well enough to adopt without
reading the engine.

## Tasks

- [x] Report the resolved mode in `spec-sync push` and `spec-sync status`, so an
      `inline` spec with no sub-issues is obviously deliberate rather than a
      parse failure — the same reasoning that put the deferred count on the plan.
- [x] Carry the mode on the plan (a plan field, not a stderr warning) so the
      skill applying it can relay it; `--json` routes warnings to stderr and the
      skill is the consumer that needs this.
- [x] Update `/spec-push` and `/spec-status` to relay the mode.
- [x] Document `mapping.phases` in the package README: both forms, the three
      values, the per-bucket default, and the non-destructive switching rule.
- [x] Note the adoption path for an established repo — set `complete: inline`
      before a first backfill, so finished specs never mint sub-issues at all.
- [x] Add tests covering the reported mode in both CLI outputs and its presence
      on the plan. Run the project's test command — green before the phase is done.

## Notes

Landed as:

- `projectionOf` carries `phaseMode`; `push` sets `plan.phaseMode`
  **unconditionally**, so the skill relaying it never has to learn that an absent
  field means `subissue`. `isEmptyPlan` and `snapshotOf` read named fields, so
  the extra key cannot make an unchanged spec look edited — the same guarantee
  `phasesWithheld` already relies on.
- `phaseModeLines` in `cli-sync.js`, printed by both `push` and `status`, and
  **silent for `subissue`**: the sub-issue lines explain themselves, and a line on
  every ordinary push would be noise. It names the bucket it resolved through,
  because with a map the config alone no longer says which mode a spec got.
- `/spec-push` and `/spec-status` relay it; the config reference section is
  rewritten as "How phases are mirrored — `mapping.phases`" covering all three
  modes, both config forms, the per-bucket default, the non-destructive switching
  rule and the pre-backfill adoption path, with a rendered `inline` example. The
  README block is rewritten from "Adopting on a long backlog" to the same shape.
- Tests: `packages/linear/test/cli-phase-mode.test.js` (new, 7 cases), plus the
  docs/skill assertions in `assets.test.js`. Two existing assertions were updated
  rather than worked around — the deliberately-exact projection-key list in
  `sync-project-placement.test.js`, and the pinned section heading in
  `assets.test.js`.

The installed `.claude/skills/spec-push` · `spec-status` are tracked **symlinks**
into `packages/linear/assets/skills/`, so they picked the change up with no
install step.