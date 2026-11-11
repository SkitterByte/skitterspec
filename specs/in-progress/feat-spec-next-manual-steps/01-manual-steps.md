---
github_issue_id: "#181"
---

# Phase 1 — `/spec-next` lists and confirms manual steps ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-next` shows a phase's manual steps in the terminal, asks
whether they are done, and records the answer. Proven by a prose-contract test
and by the copies being in sync.

## Tasks

- [x] Add a "Manual steps" subsection to §3 of
      `packages/common/assets/skills/spec-next/SKILL.md`. It covers detection by
      judgment (Decision 1), the verbatim numbered list (never fenced, never
      only a file pointer), the All done · Some failed · Not yet ask, and the
      free-text follow-up for which steps failed.
- [x] §4: a failed step stays unticked with a note under it, and the phase stays
      🔄. §6: add the `⚠️` case and the `Next` wording for Not yet and Some
      failed. A phase left 🔄 renders and arms nothing (Decision 7).
- [x] Carry the change to the distribution copies (`packages/skitterspec*`) and
      the local `.claude/skills/spec-next/SKILL.md` the way the build does it.
      Leave the provider-specific seam fills alone.
- [x] Add a test beside `packages/common/test/assets-verdict-wait.test.js`
      asserting the skill names the three answers and forbids answering with
      only a file pointer.
- [x] Update the `/spec-next` row in `docs/reference.html` and bump its
      `verified:` to this commit.
- [x] Run `pnpm test` (incl. `scripts/skill-budget.test.js`,
      `docs-freshness.test.js`); green before the phase is done.
