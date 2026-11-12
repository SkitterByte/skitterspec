---
github_issue_id: "#185"
---

# Phase 3 — `/spec-tada` skill, text output, docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-tada` produces the grouped recap and standup from the
digest, installed by `init`/`update` and documented.

## Tasks

- [ ] Text form of `skitterspec tada` mirroring the JSON digest
- [ ] Add `packages/common/assets/skills/spec-tada/SKILL.md` —
      model-invocable; runs the verb, writes Done / Explored / Open per
      project → spec, then a 3-line standup; ends with the report block
      (`.claude/rules/spec-reports.md`) carrying `Notes`, `Follow-ups`,
      `Next`
- [ ] Confirm `init`/`update` ship the new skill (and the provider
      distributions pick it up)
- [ ] Add the skill to `spec-planning.md`'s table and
      `claude-md-section.md`
- [ ] Extend the `tada` row in `docs/reference.html` (added in phase 1)
      for spec grouping; add `packages/common/src/tada/**` to its `covers`;
      bump its `verified:`
- [ ] Tests: text output snapshot; install test lists `spec-tada`; run
      `pnpm typecheck` and `pnpm test` — green
