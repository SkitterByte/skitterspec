---
github_issue_id: "#284"
---

# Phase 2 — Split spec-reports.md and spec-planning.md ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the two big rules keep only the instructions every session needs.
Everything else moves to `spec-format.md`, a skill's supporting file, or
`docs/rationale/`, and every rule reference in the skills still resolves.

## Tasks

- [x] `spec-reports.md`: keep silence, the block's shape, the field
      vocabulary, the four verdicts, follow-ups, open manual steps and the
      asking-versus-not-asking rule (one paragraph). Move the banner, the
      stack/tier rules, the wait, re-arm and re-show, the `Continue` ending and
      the `live:` line to `skills/spec-diff/review-wait.md`. Move every
      amendment narrative and incident story to `docs/rationale/spec-reports.md`.
- [x] `spec-planning.md`: keep the lifecycle table (one line per row), skills
      vs. commands, the guards (main, project, review gate, `/spec-skip`) as
      instructions, the two workspace modes, isolation basics and `## Rules`.
      Move:
  - spec types, header fields, State log, lifecycle folders and finding specs
    → `rules/spec-format.md` with `paths: ["specs/**"]`
  - live overlay → `skills/spec-to-main/` or a supporting file of the live
    command's owner; hotfix land → `skills/spec-hotfix/`; epics →
    `skills/spec-epic-next/epics.md` (named from `/spec` and `/spec-start`)
  - review-page, verdict and reviewer mechanics → `skills/spec-diff/`
  - tracker ownership and sync contract → the provider's `spec-push` skill
  - kind routing → `skills/spec/`
  - `Project conventions (fill this in)` → the project-conventions.md
    template
  - all rationale and history → `docs/rationale/spec-planning.md`
- [x] Update each `SKILL.md` that relied on moved content to name the
      supporting file at the step that uses it. Repoint rule references
      (`spec-reports.md` "carries the shape" and the like) at the new homes.
- [x] End each trimmed rule with a one-line pointer to its
      `docs/rationale/` page on GitHub.
- [x] Add a test that greps every `.claude/rules/<file>` and
      `.claude/skills/<name>/<file>` reference in the shipped skills and
      commands and checks each resolves to a shipped asset.
- [x] Rebuild the distributions (`pnpm build`) and run
      `pnpm typecheck && pnpm test`, green before the phase is done.

## Notes

Trim, don't rewrite (Decision 8). If a sentence gives an instruction, it
moves with that instruction. If it explains why, it goes to the rationale doc.
