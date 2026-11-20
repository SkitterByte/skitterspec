---
github_identifier: "#270"
github_url: "https://github.com/SkitterByte/skitterspec/issues/270"
---

# Open manual steps are listed in the report's Next rows

> **Type:** Feature
> **Name:** feat-manual-steps-in-next
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/270
> **Author:** Reuben Greaves
> **Raised:** 2026-11-20
> **Area:** packages/common/assets/rules/spec-reports.md, packages/common/assets/skills/spec-next/SKILL.md, packages/common/test/assets-manual-steps.test.js, packages/common/test/assets-report-contract.test.js, docs/reference.html, docs/review.html
> **Stack:** worktree
> **Docs:** reference, review

## Summary

When manual steps are still open at the end of any run, the report's `Next`
lists every one of them, one per row, instead of a count such as "run the seven
manual steps". When `/spec-next` has to write the steps itself, it also saves
them to the phase file so they are still there after a `/clear`.

## Problem

`feat-spec-next-manual-steps` (#180) makes `/spec-next` list a phase's manual
steps in the conversation and ask whether they are done. In ereqs on
2026-11-19 it did that. Phase 5 ended with **Not yet**, and the `/commit` run
that followed ended with `Next`: "`/spec-live`, run the seven manual steps, then
`/spec-next`". By then the list was several messages up. The phase file's only
manual task was half a sentence ("check it on the running host"), so the seven
steps existed only in the conversation. A `/clear` would lose them, and a
re-run would make up a different set. The rule lives in `/spec-next`, but the
report that broke came from another skill.

## Acceptance criteria

- At the end of any run where manual steps are still open, `Next` lists every
  step, one per row. The `**Next**` label sits on the first row, each step gets
  a row with the label cell blank, and a closing row names the command that
  comes after. A count or a file path in place of the steps does not meet this.
- This holds whichever skill writes the report, including `/commit` after a
  phase was answered **Not yet**, and `/spec-resume`.
- When `/spec-next` makes up the steps because the phase file has only a vague
  manual task, it writes them as numbered sub-checkboxes under that task before
  asking. A later `/spec-next` lists those exact steps.
- A report with no open manual steps keeps its one-row `Next`.

## Decisions

1. **The rule goes in `spec-reports.md`, and `/spec-next` points at it.** The
   report that broke was written by `/commit`, which means any skill's report
   can make this mistake. A rule kept only in `/spec-next` would miss it.
   Rejected: a `/spec-next`-only fix.
2. **`Next` takes several rows, and its label is on the first one only.** Each
   step is easy to read on its own row, and `Next` stays the last thing in the
   block, as the contract requires. Rejected: all the steps inline in one cell,
   which is hard to read at seven steps. Also rejected: labelled `Step N` rows
   above `Next`, which split the action across rows that are not `Next`.
3. **This is an amendment to the report contract, and it says so.** The
   section on the review banner warns that a third amendment "should have to
   argue harder". This amendment adds no new row type and nothing after the
   block. It lets `Next` take more than one row, which follows from the rule
   that `Next` must be usable from the state a run leaves behind. A count of
   steps that are out of sight cannot be acted on. Record this argument in the
   rule.
4. **Steps that `/spec-next` makes up are saved in the phase file.** It saves
   them only when it has to write them itself. A phase whose manual steps are
   already written as tasks stays as it is. The new sub-tasks land with the
   phase's next commit, the same way task ticks do. A later report copies
   these steps word for word and does not make up new ones.
5. **A report with steps out of view copies them from the phase file.**
   `/commit`, `/spec-resume` and similar runs read the open manual sub-tasks
   from the phase file. They never rely on a list from earlier in the
   conversation.

## Solution overview

`spec-reports.md` gains a short subsection under the `Next` rules: "Open manual
steps are rows". It shows the row layout, names the phase file as the source,
and records why this amendment is allowed. The `Next` entry in the field
vocabulary table gains a pointer to it. `/spec-next`'s *Manual steps* section
gains two things. First, when it writes the steps itself, it saves them to the
phase file before asking. Second, its `⚠️` `Next` follows the new row layout.
The prose tests check both files.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `spec-reports.md` — multi-row `Next` for open manual steps |
| Skill/rule | update | `/spec-next` §3 *Manual steps* — save the steps it writes; §6 `Next` layout |
| Business rule | add | open manual steps are listed in `Next`, one per row, copied from the phase file |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Manual steps saved to the phase file and listed in `Next` | ⬜ | [01-steps-in-next.md](01-steps-in-next.md) |

## Open questions

- None

## Changelog

- 2026-11-20 — Spec created. Follow-up to `feat-spec-next-manual-steps` (#180),
  from the ereqs `feat-project-bu-change-precheck` phase 5 report.
