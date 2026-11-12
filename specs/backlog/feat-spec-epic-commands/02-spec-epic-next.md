---
github_issue_id: "#189"
---

# Phase 2 — `/spec-epic-next` skill and the `/spec-complete` hand-off ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-epic-next` names the member to start in a new tab, or refuses
with the reason, and `/spec-complete` on a member points at it. Proven by
asset tests over both skills.

## Tasks

- [ ] Add `packages/common/assets/skills/spec-epic-next/SKILL.md`. It is
      model-invocable, resolves the epic (argument, else bare from the epic or
      member worktree), reads `skitterspec epic status --json` (its `steps` once phase 3 lands) and routes per
      Decisions 5–7. It ends with the `.claude/rules/spec-reports.md` block:
      verdicts `✅` (named or picked) and `⏸` (no lane, nothing ready, cannot
      tell); fields `Spec` · `Follow-ups` · `Next`; and the picker as the one
      control after the block when several are ready
- [ ] State in the skill that it writes nothing and moves no session, and that
      `Next` is `/spec-start <member>` "in a new tab"
- [ ] `spec-complete` SKILL.md: on a spec carrying `> **Epic:**`, `Next` is
      `/spec-epic-next` (Decision 8); everything else is unchanged
- [ ] Add a `/spec-epic-next` row to the `spec-planning.md` skill table and a
      line to the READMEs; `docs/reference.html` documents it
- [ ] Tests: assert the skill reads `epic status --json`, never runs
      `spec-start` or `spec-env up`, offers a picker for several, and has the
      three `⏸` routes; assert `spec-complete`'s epic-member `Next`; the
      install test lists the new skill
- [ ] Run typecheck + tests — green before the phase is done
