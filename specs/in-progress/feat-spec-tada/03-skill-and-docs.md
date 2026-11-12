---
github_issue_id: "#185"
---

# Phase 3 — `/spec-tada` skill, text output, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-tada` produces the grouped recap and standup from the
digest, installed by `init`/`update` and documented.

## Tasks

> Two busy days across three repos are ~19 KB as text and ~97 KB as JSON —
> the skill should read the text form.

- [x] Text form of `skitterspec tada` mirroring the JSON digest
- [x] Add `packages/common/assets/skills/spec-tada/SKILL.md` —
      model-invocable; runs the verb, writes Done / Explored / Open per
      project → spec, then a 3-line standup; ends with the report block
      (`.claude/rules/spec-reports.md`) carrying `Notes`, `Follow-ups`,
      `Next`
- [x] Confirm `init`/`update` ship the new skill (and the provider
      distributions pick it up)
- [x] Add the skill to `spec-planning.md`'s table and
      `claude-md-section.md`
- [x] Extend the `tada` row in `docs/reference.html` (added in phase 1)
      for spec grouping; add `packages/common/src/tada/**` to its `covers`;
      bump its `verified:`
- [x] Tests: text output snapshot; install test lists `spec-tada`; run
      `pnpm typecheck` and `pnpm test` — green
