# Bug: task sub-bullets are dropped from the Linear mirror

> **Type:** Bug
> **Name:** bug-task-subtree-bullets-dropped (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-08-27)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-27
> **Area:** packages/sync-core/src/task-block.js, packages/sync-core/src/normalize.js, packages/sync-core/src/write.js
> **Stack:** worktree

## Symptom

A non-checkbox sub-bullet that belongs to a task's subtree is dropped from the
parse entirely — no block, no join, no warning — and so never reaches the
sub-issue description. The parse succeeds, the counts look plausible, and the
text is simply absent from the mirror.

Reported from the field (skitterspec-linear 9.2.0, 96-file spec corpus):

| | source checkboxes | mirrored | lost |
|---|---|---|---|
| spec A | 65 | 64 | 1 |
| spec B | 84 | 81 | 3 |

Reproduced here against `packages/sync-core/src/task-block.js`:

```js
const src = [
  '- [ ] Parent task',              // indent 0, continuation indent 6
  '      - [x] Nested checkbox',    // indent 6, continuation indent 12
  '            wrapped continuation',
  '      - **Sibling note**',       // indent 6 — DROPPED
  '        its own wrapped line',   // DROPPED
]
findTaskBlocks(src)   // 2 blocks; lines 3-4 appear in neither
```

Indent 6 is the default hanging indent for a top-level task, so this is the
common shape, not an exotic one. `mapping.tasks` defaults to `"checklist"`
(`config.js:64`), so every 9.x project runs this path.

Repo content is safe — sync is one-way — so the damage is confined to a
silently-incomplete mirror. That is still the dangerous kind of failure: nothing
reports it, and it was only caught by probing the pushed description for a known
substring.

## Root cause

`findTaskBlocks` (`task-block.js:114`) can only ever *extend* a block with
continuation lines; it has no model of list nesting. The inner loop breaks at
`task-block.js:141-143` when it meets a bare list marker whose indent differs
from the block's hanging indent, then the outer loop resumes at that line — which
is not a checkbox, so `TASK_START_RE` skips it, and its own wrapped continuation
lines are skipped with it.

`normalize.js:350` builds the sub-issue checklist **only** from returned blocks,
so any line no block claims is absent from the projection. There is no
reconciliation between "lines in the task list" and "lines in the mirror", which
is why the loss is silent.

## Decisions

1. **A task owns its subtree.** A line indented deeper than a task's own marker
   belongs to that task's list subtree, per ordinary markdown nesting. The parser
   gains that model; today it has only "continuation at the hang".
2. **Orphaned sub-bullets become their own blocks, flagged non-checkbox** —
   `{ checkbox: false, mark: null }` — rather than being joined onto the enclosing
   task's text. Joining would rewrite the parent's `text` (churning its hash on
   every already-pushed spec) and would reorder content: the parent block comes
   first, so a note written *after* a nested checkbox would surface *before* it.
   Separate blocks keep source order, indentation and text intact.
   (Rejected: the reporter's "join as prose to the enclosing task" — same
   information preserved, but at the cost of order and parent stability.)
3. **A non-checkbox block renders as a plain `- ` bullet**, never as `- [ ]`.
   `normalize.js` hardcodes a checkbox today; emitting these as checkboxes would
   invent tasks that do not exist in the repo.
4. **Only lines inside a task's subtree are newly claimed.** A bullet at or
   shallower than the top-level task indent — a bullet in a phase file's prose or
   Notes section — stays unmirrored, exactly as today. The projection is still
   "the task list", not "the whole phase body"; this fixes a hole in it rather
   than widening it.
5. **Warn is not enough — assert coverage.** The durable fix is a structural
   invariant (Phase 3): every line inside a task subtree appears in the
   projection. A fixture set alone would have missed this shape for another
   release.
6. **Accept the one-time re-push churn.** Specs carrying these bullets will report
   their sub-issues as `update` on the next push. Precedent:
   `feat-linear-mirror-fidelity` Decision 7. One push reconciles it, and it earns
   a release note.

## Solution overview

Track the enclosing task's marker indent while scanning. When the continuation
loop breaks on a bare list marker, the line is no longer abandoned: if it is
deeper than the enclosing task's indent it starts a **non-checkbox block**, which
absorbs its own wrapped continuations the same way a task does. `normalize.js`
branches on `checkbox` when rendering; `write.js` skips non-checkbox blocks (its
`stampIssueId` is the legacy per-task stamp and must never target a plain bullet).

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | update | `findTaskBlocks` block gains `checkbox`; `mark` is `null` when false |
| Domain object | update | non-checkbox subtree bullets now appear in the projection |
| Domain object | update | `subIssueHash` shifts for affected specs (one-time re-push) |
| Engine | fix | `normalize.js` renders plain bullets as `- `, not `- [ ]` |
| Engine | fix | `write.js` `stampIssueId` skips non-checkbox blocks |
| Test | add | fixtures at indents 2/4/6; subtree-coverage invariant |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Claim subtree bullets in the parser (red→green) | ✅ | [01-parser-subtree.md](01-parser-subtree.md) |
| 2 | Render them, and guard the writers | ✅ | [02-projection-and-writers.md](02-projection-and-writers.md) |
| 3 | Coverage invariant — nothing goes unmirrored | ⬜ | [03-coverage-invariant.md](03-coverage-invariant.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-27 | Ready | backlog | Reuben Greaves |
| 2026-08-27 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-27 — Captured from the skitterspec-linear 9.2.0 field report (ereqs
  adoption, 96-file corpus, 815 in-task lines). Reproduced locally before
  writing; the repro is in the Symptom above.
- 2026-08-27 — Filed as **Ready** in `backlog/` rather than the usual `/spec-bug`
  `In Progress`: it was captured as a batch triage with nothing implemented, so
  `/spec-go` picks it up from a clean start.
- 2026-08-27 — Chose separate non-checkbox blocks over joining to the parent
  (Decision 2) after finding that joining reorders content and churns every
  already-pushed parent task's hash.
- 2026-08-27 — Phase 1: a blank line alone does **not** close a task subtree —
  a loose nested list is still that task's. What closes it is a later line at or
  shallower than the task's own marker indent, which keeps a Notes-section bullet
  out while letting a loose sub-bullet in. Pinned by its own fixture.
- 2026-08-27 — Phase 1: sub-bullets keep their own `marker` (`-`, `*`, `1.`)
  rather than being normalised to `-`, so an ordered sub-list survives the round
  trip. Not in the original plan; found while writing the fixtures.
- 2026-08-27 — Phase 2: churn measured on this repo and it is **zero** — the
  projection is byte-identical to `main` for all four linked specs, and the 11
  sub-issue updates the plan reports are pre-existing drift (`main` reports the
  same 11). No spec here writes sub-bullets under a task, so the new content path
  is exercised only by fixtures. Decision 6 holds; no duplicates are minted.
