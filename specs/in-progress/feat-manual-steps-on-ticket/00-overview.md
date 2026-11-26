---
github_identifier: "#325"
github_url: "https://github.com/SkitterByte/skitterspec/issues/325"
---

# Open manual steps on the ticket

> **Type:** Feature
> **Name:** feat-manual-steps-on-ticket
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/325
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Area:** packages/sync-core/src/{normalize,summary,task-block}.js, packages/sync-core/test/**, packages/azure-boards/test/**, packages/common/assets/rules/{spec-format,spec-reports}.md, packages/common/assets/skills/{spec,spec-bug,spec-next}/**, docs/{azure-boards,github,jira,linear,reference}.html
> **Stack:** worktree
> **Docs:** azure-boards, github, jira, linear, reference

## Summary

Steps that only a person can do, such as running SQL on Prod, a KQL query or a
shell command, show up on the ticket while they are still open. They appear on
the phase's Task and on its parent item, and each script is a code block you
can copy. Ticking the steps removes them from the parent.

## Problem

A phase's manual steps live only in its phase file, and people find tickets
more easily than spec files. In ereqs (2026-11-26, `normalize
feat-order-line-permission-override`), the User Story's description never
mentions the open steps. Phase 3's Task (AB#1149) does carry them, but the SQL
sits as inline code inside a nested checklist item, surrounded by finished
tasks, so Boards shows it as one long line that is hard to copy. This pattern
is common in ereqs: 6 active specs have manual steps (5 with
`sql`/`kql`/`sh` blocks), and 39 completed specs have script blocks.

## Acceptance criteria

- A started phase with an open `## Manual steps` step that holds a ```` ```sql ````
  block: `normalize` shows a "Manual steps (open)" section on both the phase
  Task and the parent, with the SQL as a fenced code block.
- Tick every step and push again: the section is gone from the parent, and
  `verify` reports intact.
- A spec with no manual steps projects byte-identically to today.
- A spec whose manual steps are written inline, the legacy way, also projects
  byte-identically to today: nothing is guessed and nothing errors.
- In `summary` mode, the block carries the same open steps, grouped by phase.

## Decisions

1. **A `## Manual steps` section in a phase file is the marker.** It holds
   checkbox steps, and each step may carry an indented fenced block (`sql`,
   `kql`, `sh`, …). The section is recognised in addition to what exists today
   and rejects nothing, so inline legacy steps project as they always have.
   Guessing at "by hand" prose was rejected because it would accuse healthy
   specs (`negative-checks.md` rule 1).
2. **Code projects as fenced markdown, not `<pre><code>`.** Boards stores
   markdown verbatim and renders a fence as a copyable block. Its sanitiser
   strips tag-shaped tokens, so literal HTML would probably vanish. Jira's ADF
   converter already turns fences into `codeBlock`, and GitHub and Linear
   render them natively.
3. **The Task hoists the section instead of copying it.** While any step is
   open, the phase body moves `## Manual steps` up under the Goal and retitles
   it "Manual steps (open)". Ticked steps stay as `- [x]`. When every step is
   ticked, the section stays where the author wrote it, under its own name.
   A copy at the top would show every step twice.
4. **The parent gets "Manual steps (open)" as its first section**, straight
   after the title, grouped under a `###` heading per phase. Only unticked
   steps appear, each with its code. When nothing is open, the section is not
   emitted at all.
5. **Only started phases count (🔄 or ✅).** A step in a phase that has not
   started is not actionable yet. Putting a Prod script on a backlog ticket
   invites someone to run it before the code ships, so not-started phases
   contribute nothing to the parent. Their Task still hoists the section,
   because that body is the phase file.
6. **Provider-neutral, and in both description modes.** The work goes in
   sync-core, so all four providers get it. In `summary` mode, the open steps
   go into the block after the acceptance criteria, and each phase's block
   gains its own open steps. That mode exists for readers on the board.
7. **No new sync state.** The section is part of the normalized projection,
   so the base snapshot, the description hashes and `verify` all see it as
   repo-owned content, not as a hand edit. Tests prove this round trip,
   including SQL that contains `<`, `>` and `&` through the Boards compare
   reduction.
8. **Skills write the new form.** `/spec`, `/spec-bug` and `/spec-next` write
   manual steps under `## Manual steps`, and Issue specs put all of their steps
   there. `/spec-next` reads that section first when it lists steps and falls
   back to today's judgment for legacy files. Report rows keep copying from the
   phase file.

## Solution overview

The phase file format:

````markdown
## Manual steps

- [ ] On Prod, grant the override permission:

  ```sql
  INSERT INTO permissions (code) VALUES ('order-line-override');
  ```

- [ ] Confirm the override button appears for an admin
````

`readPhaseFiles` parses the section into `phase.manualSteps`, an array of
`{ text, done, code: [{ lang, body }] }` (empty when there is no section).
`projectPhaseBody` hoists the section when any step is open.
`buildDescription` (spec mode) and `specBlockInner` (summary mode) take a
rendered "Manual steps (open)" section built from the started phases.
`phaseBlockInner` adds the phase's own open steps. Nothing changes when every
`manualSteps` is empty or fully ticked.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Spec format | add | `## Manual steps` phase section (checkbox steps + fenced code) |
| Projection | update | parent description: "Manual steps (open)" section |
| Projection | update | phase body: section hoisted under the Goal while open |
| Projection | update | summary blocks: open steps (spec + phase) |
| Skill/rule | update | spec-format.md, spec-reports.md, /spec, /spec-bug, /spec-next |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Parse the `## Manual steps` section | ✅ | [01-parse-section.md](01-parse-section.md) |
| 2 | Project open steps onto Task and parent | ✅ | [02-projection.md](02-projection.md) |
| 3 | Skills write and read the new form | ⬜ | [03-skills-and-docs.md](03-skills-and-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-26 — Spec created from the ereqs brief. Chose fenced markdown over
  `<pre><code>` because of the Boards sanitiser, and decided that only started
  phases surface on the parent.
- 2026-11-26 — Phase 2: Jira's `mdToAdf` now removes a list-indented fence's
  indent from the script body. Without that, every pasted line would carry
  two stray spaces.
