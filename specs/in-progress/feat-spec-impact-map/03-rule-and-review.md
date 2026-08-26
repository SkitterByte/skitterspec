# Phase 3 — spec-planning rule + `/spec-review` drift check + tests ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** The overview contract documents the Impact section, and `/spec-review`
treats a stale Impact map as drift.

## Tasks

- [x] In `packages/common/assets/rules/spec-planning.md`, add `Impact` to the
      `00-overview.md` contents description (the "entry point / dashboard: header,
      Problem, Decisions, Solution overview, …" line) so the overview contract
      lists it, with a one-line note on what it holds.
- [x] In `packages/common/assets/skills/spec-review/SKILL.md`, add an Impact-map
      drift check: re-validate each `## Impact` row against the real code (does
      the named endpoint/schema/DB object/rule exist and match the stated
      change?) and flag/refresh stale rows, alongside the existing checks.
- [x] Extend `assets.test.js`: assert `spec-planning.md` mentions the Impact
      section in the overview contents, and that `spec-review` SKILL.md
      references validating the Impact map. Run `npm test` — green before the
      phase is done.

## Notes

`/spec-review` already re-checks files, tasks and Decisions against code; the
Impact map is the highest-signal drift target because each row is a named,
checkable surface.
