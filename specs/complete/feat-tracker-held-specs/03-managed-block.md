---
github_issue_id: "#125"
---

# Phase 3 — Managed block + summary mode ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** under `mapping.description: "summary"`, a push writes only the managed
block and leaves every other line of the description as the team wrote it.

## Tasks

- [x] `mapping.description` (`spec` · `summary`) and `summary.delimiter`
      (`comment` · `heading`) in all four provider configs, validated by a
      shared kit helper (`mergeDescription`); `.example`/`.md` references
      updated. GitHub defaults to `comment` (measured); Linear, Jira and Azure
      to `heading` (provisional, #132)
- [x] New installs get summary: GitHub's `init-config` writes
      `mapping.description: "summary"` (`--description spec` opts out). A
      config without the key is `spec`, so no `update` migration is needed —
      see the overview Changelog
- [x] sync-core `src/summary.js`: the spec block — summary (`## Summary`, else
      Problem's, else Symptom's first paragraph), acceptance criteria
      checklist, Touches (each Impact row's Detail, else Surface), Gating, spec
      path — each part skipped when its source is absent
- [x] sync-core: the sub-issue block — the phase's goal (task count arrives in
      phase 4)
- [x] sync-core: pure `spliceBlock` / `blockOf` — present → replaced in
      place, absent → put above the team's text, damaged → `null` (never
      written)
- [x] Provider apply: the shared kit skeleton reads the live body and writes
      the splice for the issue and every sub-issue update; a damaged or
      unreadable body is named and its body left out of the write
- [x] Drift and verify scoped to the block (`comparableDescription` in
      `remoteDescriptionEdited` and `verifyLines`)
- [x] `mapping.phases: "none"` — no unlinked phase is projected; a linked one
      keeps its sub-issue
- [x] Adoption: `preserve` is a no-op in summary mode (GitHub, Jira, Azure;
      Linear has no preserve)
- [x] Tests: `packages/sync-core/test/sync-summary-block.test.js` (12) and
      `packages/github/test/summary-block.test.js` (7) — splice round-trips,
      damaged blocks, outside-text stays-silent drift, spec mode unchanged,
      `phases: none`, preserve; init-config default and `--description`.
      `pnpm test`: 4510 passed
