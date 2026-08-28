# Bug: every checkbox flattens into one `## Tasks` list, losing its section

> **Type:** Bug
> **Name:** bug-task-sections-flattened (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-08-28)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-28
> **Area:** packages/sync-core/src/normalize.js, packages/linear/assets/core/linear.config.md
> **Stack:** worktree

## Symptom

A phase file's checkboxes are mirrored into a single `## Tasks` list in the
sub-issue description, whatever heading they were written under. The source
heading is dropped, so criteria written under `## Acceptance` arrive
indistinguishable from the task list above them.

Reported from the field against 10.0.0 and reproduced here:

```
phase file                          mirrored sub-issue
------------------------------      ------------------------------
## Tasks                            ## Tasks
- [ ] **1. A task**                 - [ ] **1. A task**
  - a plain sub-bullet                - a plain sub-bullet
## Acceptance                       - [ ] an acceptance criterion
- [ ] an acceptance criterion       - [ ] a second criterion
- [ ] a second criterion
```

Cosmetic, not corrupting — every line still reaches the mirror (that was
`bug-task-subtree-bullets-dropped`), and sync is one-way so the repo is
untouched. But it affects 3 of the reporter's 4 mirrored specs, and a sub-issue
that ends with six acceptance criteria formatted as open tasks reads as six
unfinished work items.

## Root cause

`readPhaseFiles` (`normalize.js:350`) runs `findTaskBlocks` over the **whole
phase body** and returns one flat `tasks` array; nothing records which section
each block came from. `subIssueBody` (`normalize.js:495`) then hardcodes the
heading:

```js
parts.push('## Tasks', '', ...phase.tasks)
```

So the section structure is lost at parse time and a single heading is invented
at render time. Neither half knows the other exists.

## Decisions

1. **Group by the enclosing heading, don't re-parse per section.** Run
   `findTaskBlocks` over the whole body exactly as today, then map each block to
   the nearest preceding heading line. Re-splitting the body and parsing each
   section separately would change block semantics at section boundaries — the
   subtree tracking from `bug-task-subtree-bullets-dropped` depends on scanning a
   continuous body — and this bug is not worth risking that one.
2. **Preserve the heading as written, at its source level.** `## Acceptance`
   stays `## Acceptance`; `## Tasks — 2a (read-model) ✅` keeps its suffix and its
   emoji. Fidelity is the whole point of a mirror, and normalising the text would
   just be a different kind of dropping.
3. **Checkboxes before any heading keep today's `## Tasks` default.** A phase
   file with no headings must project byte-identically to today — that is what
   holds the churn at zero for the common case.
4. **Accept the churn where it is real.** A phase file whose tasks sit under more
   than one heading changes its `subIssueHash` and re-pushes once. Measured on
   this repo: **2 of 91 phase files**, both already using `## Tasks — 2a/2b`
   sub-headings, so both are improved rather than merely churned. 561 of 566
   checkboxes here sit under a plain `## Tasks` and are unaffected.
   (Precedent: `feat-linear-mirror-fidelity` Decision 7.)
5. **Document the projection either way.** `linear.config.md` describes
   `mapping.tasks` but never said what happens to section structure — which is
   why the reporter could not tell a deliberate choice from an oversight. The
   doc line lands whether or not the behaviour changes.

## Solution overview

Add a heading index to `readPhaseFiles`: the line numbers of every `^#{2,6} `
heading outside a fence (`fenceMask` already exists). Each task block's `start`
resolves to the last heading before it. Emit `taskGroups`
(`[{heading, tasks}]`) alongside the existing flat `tasks`, and have
`subIssueBody` render one section per group, falling back to `## Tasks` for the
leading unheaded group.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | add | phase gains `taskGroups: [{heading, tasks}]` |
| Domain object | keep | flat `tasks` stays, so nothing downstream breaks |
| Engine | fix | `subIssueBody` renders source headings, not a hardcoded one |
| Domain object | update | `subIssueHash` shifts for multi-section phase files only |
| Docs | update | `linear.config.md` states how sections project |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Group tasks by their source heading | 🔄 | [01-group-by-heading.md](01-group-by-heading.md) |
| 2 | Measure the churn, and document the projection | ⬜ | [02-churn-and-docs.md](02-churn-and-docs.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-28 | Ready | backlog | Reuben Greaves |
| 2026-08-28 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-28 — Raised from the 9.2.0 field report's follow-up. This item never
  reached the original triage (`2f84cf4`) — it was absent from the report text
  received, so it was neither declined nor deferred, and produced no spec and no
  doc note. Decision 5 exists so that outcome cannot repeat silently.
- 2026-08-28 — Chose heading-mapping over per-section parsing (Decision 1) to
  avoid disturbing the subtree scan that `bug-task-subtree-bullets-dropped`
  installed.
