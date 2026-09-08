---
linear_issue_id: "SKS-74"
---

# Phase 2 — Trim always-loaded context ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every session loads materially fewer tokens — descriptions carry
triggers + outcome only, and the CLAUDE.md section no longer restates the rule.

## Tasks

- [x] Rewrite all 13 skill descriptions (9 in `packages/common/assets/skills`,
      4 in `packages/linear/assets/skills`) to ≤ 500 chars: keep the "Use
      when …" trigger phrases and the one-line outcome; move transport/engine
      mechanism into the body's opening paragraph where it isn't already there.
      Worst offenders first: spec-linear-setup (824ch), spec-push (739ch),
      spec-hotfix (680ch), spec-sync (607ch).
- [x] Slim `packages/common/assets/claude-md-section.md` to the everyday loop
      line, the skills-vs-commands note, and pointers to
      `.claude/rules/spec-planning.md` (which keeps the table and all
      conventions) — target ≤ 15 lines from 53.
- [x] Confirm `spec-planning.md` still carries everything the section drops
      (lifecycle table, type/folder conventions, isolation summary); add
      anything that would otherwise be lost.
- [x] Resync this repo's own `CLAUDE.md` spec-workflow section to the slimmed
      template (manual edit — init leaves a manual section alone).
- [x] Add a description length-budget test (≤ 500 chars per SKILL.md
      description across both asset trees) — a lint on a deliberate budget, with
      the rationale in a comment.
- [x] Rebuild dists (`pnpm build`).
- [x] Add/extend tests covering this phase; run `pnpm test` — green before the
      phase is done.

## Notes

Descriptions are the only always-loaded part of a skill; bodies load on
invocation. Routing quality lives in the trigger phrases — keep those verbatim
wherever they already work.
