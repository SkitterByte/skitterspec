# Bug: Phase-file content is silently dropped from the pushed sub-issue

> **Type:** Bug
> **Name:** bug-phase-content-dropped (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-29
> **Area:** packages/sync-core (normalize, task-block), packages/linear (spec-push skill)
> **Stack:** worktree

## Symptom

Content written in a phase file never reaches that phase's Linear sub-issue. The
push reports success, `spec-sync verify` reports the round-trip intact, and
nothing warns — the mirror is simply missing text.

Reported from `ereqs` against 10.0.1 while mirroring 250 completed specs. Two
faces were reported; a third was found while reproducing.

Run this phase file through `normalizeLocal` with the shipped default
(`mapping.tasks: 'checklist'`):

```
**Goal:** make the engine work.

The parser has to land before the CLI can use it.

## Tasks

- [x] Add the parser
- [~] Wire the CLI
- [ ] Document the auth header

  | Header | Value |
  |--------|-------|
  | X-Extraction-Key | shared secret, from Key Vault |

## Notes

Rotate the key before deploying.
```

Everything below survives in the mirror:

```
make the engine work.

## Tasks

- [x] Add the parser
- [ ] Document the auth header
```

## Root cause

One cause, three faces: **`subIssueBody` rebuilt rather than projected.**
At `normalize.js:542` it assembled two harvested fragments — the
`**Goal:**` paragraph and the task opener lines `findTaskBlocks` claimed — and
discarded every line neither fragment covered.

1. `TASK_START_RE` (`task-block.js:20`) matched only `[ xX]`, so `[~]`, `[>]` and
   `[-]` opened no block and were claimed by nothing.
2. A table or fenced block nested under a task is a `BLOCK_BREAK`, so
   `collectContinuation` stopped there and its lines were claimed by nothing.
   **This is not the corruption `tables.js` fixes** — that content never reached
   the flattener at all, so `bug-linear-nested-table-corruption` fixed only the
   overview-description path.
3. Prose and whole `##` sections outside the Goal paragraph and the task list
   were never harvested in the first place.

`buildDescription` never had this problem because it projects the overview
**section by section** — lossless by construction. The phase body was the one
place that enumerated the shapes it remembered.

Why nothing caught it: `sync-task-coverage.test.js` guards the parser's claim of
a task subtree, but its own `TASK_LINE` carried the same `[ xX]` assumption and it
skips fenced lines — it was written with the parser's blind spot. This repo's spec
corpus also happens to contain no `[~]` markers and no task-nested tables.

**Scale: 89 sections across 88 of this repo's own 96 phase files were dropped**
— including the `## Goal` section of the 4 phase files written
with a `## Goal` heading rather than an inline `**Goal:**`, which pushed a
sub-issue with no goal at all.

## Failing test (red)

`packages/sync-core/test/sync-phase-body-fidelity.test.js` — one test per face
plus a token-reconciliation invariant over the whole fixture, and a corpus-scale
guard that every `##` section of every phase file in `specs/` reaches the body.

Run: `node --test packages/sync-core/test/sync-phase-body-fidelity.test.js`

Red output before the fix:

```
✖ no phase-file content is dropped from the projected body
  phase-file words missing from the pushed body: Goal, The, has, to, land,
  before, CLI, can, use, it., Wire, CLI, Header, Value, X-Extraction-Key,
  shared, secret, from, Key, Vault, js, const, keep, me', Notes, Rotate, key,
  before, deploying.
```

## Fix

- [x] Accept any single-character mark in `TASK_START_RE`, `CHECKBOX_RE` and
      `parseTaskLine`, carrying it through verbatim; only `x`/`X` means done.
- [x] Replace the fragment rebuild with `projectPhaseBody` — the phase file as
      written, each task block spliced out for its rendered single-line form,
      everything else passed through. Line-indexed splicing is what
      `task-block.js` was built for.
- [x] Leave out only the h1 and the `> **Status:**` line (both pushed as their
      own field), and strip `localOnlySections` as the description path does.
- [x] Recognise a `## Goal` section as well as an inline `**Goal:**` for
      `mapping.tasks: 'none'`.
- [x] Delete `groupTasksByHeading` — projecting the file keeps headings in place,
      so putting them back is no longer needed.
- [x] Close the coverage invariant's blind spot: `TASK_LINE` now matches the
      parser's any-mark form.
- [x] Update `/spec-push`'s description of the sub-issue body.
- [x] Failing test now passes (GREEN); full suite green — no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Projection | update | sub-issue body is the phase file, not a rebuilt task list |
| Config key | update | `mapping.tasks: 'none'` now also reads a `## Goal` section |
| Skill/rule | update | `/spec-push` sub-issue-body description |

**Every linked spec's sub-issue bodies change on the next push.** That is the
point — they were missing content — but it means the first push after upgrading
is a large, expected update across all sub-issues. Two shape changes ride along:
the `**Goal:**` label is now kept (it is content, and unlike the title and status
it is not pushed as a field of its own), and a `## Tasks` heading is no longer
synthesised for a phase file that has none.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-29 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-29 — Bug reproduced; failing test added (red). Reported from `ereqs`
  as two faces (`[~]` markers, task-nested tables/fences); reproducing found a
  third and larger one — all prose and sections outside Goal and Tasks.
- 2026-08-29 — Decided to project the phase file rather than widen the harvest.
  Widening would have meant enumerating shapes again, which is how the first two
  faces were missed; projecting is lossless by construction and matches
  `buildDescription`. Cost: sub-issue bodies change for every linked spec.
- 2026-08-29 — Kept the `**Goal:**` label rather than special-casing it away.
  The h1 and status line are dropped because they are pushed as fields; the goal
  label is not, so dropping it would be unjustified loss.
- 2026-08-29 — Inverted two tests that had encoded the loss as intended
  behaviour (`a heading holding no checkboxes is not emitted`, and the fenced-
  example assertions). The fence-example invariant that still matters — an
  example is not harvested as a real task or section — is now asserted by
  occurrence count rather than absence.
- 2026-08-29 — Fixed: phase bodies are projected, not rebuilt; test green, full
  suite 637 passing.
