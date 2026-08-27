# Phase 2 — Detect and report a pre-9.0 mirror ⬜

> **Status:** Not started

**Goal:** upgrading 8.x → 9.x can no longer silently produce an all-creates plan
that orphans a live mirror.

## Tasks

- [ ] Add `detectLegacyMirror(dir, snapshotDir, config)` to `sync-core`, returning
      `null` or `{ keys, orphanCount }`. Markers (Decision 5): `linear_project_id`
      on the overview, `linear_milestone_id` on any phase file, or a last-pushed
      snapshot shaped `{project, milestones, issues}`.
- [ ] `orphanCount` counts what the 8.x snapshot recorded — projects, milestones
      and task issues — so the message can name the real blast radius, as the
      reporter's "2 projects, 15 milestones and 145 task issues" did.
- [ ] Test it against a synthetic 8.x spec folder + snapshot fixture, and assert
      it returns `null` for a clean 9.x spec (no false positive on a
      never-pushed spec).
- [ ] Attach it to the plan as `plan.legacy` in `push` — a field, not a stderr
      warning (Decision 4). Assert it survives `--json`.
- [ ] Print a loud block in human output naming the keys found, the orphan count,
      and `MIGRATION.md`.
- [ ] Add a step to `/spec-push`: if `plan.legacy` is present, **stop**, relay
      the count, and do not apply the plan until the user confirms or migrates.
      Guard it with an assets test the way the other skill-prose rules are.
- [ ] Ship the guide: add `MIGRATION.md` to `packages/skitterspec-linear`'s
      `files` (copying it into the dist if `build-dist.js` needs to place it),
      and link it from `SETUP.md` with a short "upgrading from 8.x" pointer.
- [ ] Assert the packaging in a test — `npm pack --dry-run` (or the build-dist
      output) contains `MIGRATION.md`. A docs fix that silently stops shipping is
      the bug being fixed.
- [ ] GREEN — full suite green. Commit with a `Release-Note:`.
