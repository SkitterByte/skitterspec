# Phase 2 — `/spec-bug` + `/spec-hotfix` templates + tests ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** The bug and hotfix overview templates carry the same `## Impact`
section as `/spec`, kept consistent by tests.

## Tasks

- [ ] Add the `## Impact` block (identical shape to Phase 1) to the
      `00-overview.md` template in
      `packages/common/assets/skills/spec-bug/SKILL.md`, positioned to match the
      feature template (after the solution/fix overview, before `## Phases`).
- [ ] Add the same `## Impact` block to
      `packages/common/assets/skills/spec-hotfix/SKILL.md`, respecting that
      template's existing structure and Base-version header.
- [ ] Extend the `assets.test.js` test to assert the `## Impact` heading + table
      header are present in `spec-bug` and `spec-hotfix` SKILL.md (parametrise
      over `['spec', 'spec-bug', 'spec-hotfix']`). Run `npm test` — green before
      the phase is done.

## Notes

Keep the block byte-for-byte consistent across the three templates so the
parametrised test is a single source of truth and future edits stay in sync.
