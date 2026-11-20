---
github_issue_id: "#271"
---

# Phase 1 — Manual steps saved to the phase file and listed in `Next` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** At the end of any run where manual steps are still open, the report
lists them one per row under `Next`, copied from the phase file. The prose
tests prove both rules are there.

## Tasks

- [ ] `packages/common/assets/rules/spec-reports.md`: add "Open manual steps
      are rows" under the `Next` rules, using the layout from Decision 2. Say
      that the source is the phase file's open manual tasks, never an earlier
      message (Decision 5), and that a count or a file path does not count.
      Record the amendment argument (Decision 3) in a few lines. Point at the
      new subsection from the `Next` row of the field vocabulary table.
- [ ] Add a worked `⚠️` example with a multi-row `Next` to the same file.
- [ ] `packages/common/assets/skills/spec-next/SKILL.md` §3 *Manual steps*:
      when the steps have to be written because the phase file holds only a
      vague manual task, write them as numbered sub-checkboxes under it before
      asking (Decision 4). §6: the `⚠️` `Next` for **Not yet** and
      **Some failed** follows the `spec-reports.md` layout. Point at the rule;
      do not copy it.
- [ ] Tests: extend `packages/common/test/assets-manual-steps.test.js` to check
      that steps the skill writes are saved to the phase file. Add an assertion
      to `assets-report-contract.test.js`, or a new test beside it, that the
      rule names the multi-row `Next` and rules out a count. Add a
      stays-silent assertion that a one-row `Next` remains the default.
- [ ] Update the `/spec-next` row in `docs/reference.html` and the report
      section of `docs/review.html`. Run
      `node scripts/docs-freshness.js verify reference review`.
- [ ] Run `pnpm test`, including `scripts/skill-budget.test.js` and
      `docs-freshness.test.js`. It must be green before the phase is done.
