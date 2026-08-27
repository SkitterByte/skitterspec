# Phase 4 — Naming handle, docs & 9.0.0 release ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the `feat-<name>` copy-paste handle exists in new specs, all docs
describe the Issue model, and the package is ready to cut as
`skitterspec-linear@9.0.0` — proven by compose/build-dist/assets tests.

## Tasks

- [ ] Add `> **Name:** <feat-slug>` to the `/spec` overview template
      (`.claude/skills/spec/SKILL.md`) and to `/spec-bug`/`/spec-hotfix`
      templates for parity, positioned right under `**Type:**`. It carries the
      folder handle so it pastes straight into `/spec-go`.
- [ ] Update `/spec-init` (packages/common) so it seeds/repairs the `Name` line
      in the template it writes, and (optionally) back-fills it on existing
      overviews it touches — idempotent.
- [ ] Update READMEs (`packages/skitterspec`, `packages/skitterspec-linear`,
      `packages/common`) and `.claude/rules/spec-planning.md`'s ticketing-provider
      paragraph to the Issue/sub-issue model (spec=Issue, phase=sub-issue,
      tasks not synced).
- [ ] Update `MIGRATION.md`: the config-key changes (`mapping`, `projectId`,
      drop `initiativeId`, `states` are now issue states, `fieldOwnership`), the
      `linear_milestone_id` → `linear_issue_id` frontmatter rename, and that the
      first push after upgrade re-creates the mirror (snapshot format changed).
- [ ] Reframe `docs/index.html` (marketing site) to the Issue model — remove
      Project/Milestone framing; describe spec→Issue, phase→sub-issue, and the
      one-way mirror.
- [ ] Bump `packages/skitterspec-linear/package.json` to `9.0.0` and confirm
      `scripts/build-dist.js` bundles the reshaped `sync-core`. Leave the actual
      `npm publish` to the maintainer.
- [ ] Tests: `scripts/compose.test.js` / `scripts/build-dist.test.js` and
      `packages/linear/test/assets.test.js` updated for the new skill/config
      content and the version; a check that no doc still says
      "Project"/"Milestone" in the sync context. Run typecheck + tests — green
      before the phase is done.

## Notes

The title fix (`1d0d301`) is already on `main`; it rides into 9.0.0 with this
work — no separate action beyond the version bump.
