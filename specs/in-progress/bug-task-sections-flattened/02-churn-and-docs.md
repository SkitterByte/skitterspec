# Phase 2 — Measure the churn, and document the projection 🔄

> **Status:** In progress

**Goal:** the re-push cost is a measured number rather than an estimate, and the
projection's treatment of sections is written down.

## Tasks

- [ ] Measure churn against `main`: diff `spec-sync normalize --json` for every
      linked spec before and after, and record the count of changed projections
      in the Changelog. Decision 4 predicts 2 of 91 phase files.
- [ ] Confirm the plan reports those as `update`, never `create` — no duplicate
      sub-issues (`spec-sync push --json --skip-state-check`).
- [ ] Document it in `linear.config.md` under `mapping.tasks`: the checklist
      mirrors each `##` section of the phase file as its own heading, and
      checkboxes written before any heading appear under `## Tasks`.
- [ ] Guard the doc claim in `packages/linear/test/assets.test.js`, the way the
      other `linear.config.md` claims are guarded.
- [ ] GREEN — full suite green. Commit with a `Release-Note:` — this is a
      user-visible change to what the mirror looks like.
