# Phase 3 — Tasks ↔ Issues round-trip ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a task checkbox maps to a Linear Issue — text co-authored, completion
binary both-ways — with the issue identifier carried inline on the task line;
proven by fixtures and a live smoke.

## Tasks

- [ ] `normalize.js`: parse task lines into id-keyed items `{ id, text, done }`,
      where `id` is the inline `(TEAM-123)` identifier (absent = unlinked/new) and
      `done` is the `[x]`/`[ ]` state. Strip the identifier from `text` so wording
      compares cleanly. Group tasks under their phase/milestone.
- [ ] `mcp.js`: add issue ops to the adapter — list/read, and `save_issue` upsert
      (keyed on `id`, attached to project + milestone). Map completion:
      pull `state.type === 'completed'` → `[x]`; push `[x]` → a completed state,
      `[ ]` → a non-completed state (leave an already-non-completed issue's exact
      state untouched).
- [ ] `write.js` denormalizer: apply pulled task edits (text, checkbox) to the
      matching task line by inline id; append `(TEAM-123)` to a newly-created
      issue's line; add a new task line for a Linear-only issue. Byte-untouched
      elsewhere.
- [ ] Wire `tasks`/`taskBreakdown` as a keyed field; push creates/updates issues,
      pull applies via denormalizer; item-level conflicts refuse (Phase 1).
- [ ] Tests: fixtures for local text edit → issue update, tick `[x]` locally →
      issue closed, close issue in Linear → `[x]` pulled, new task → new issue with
      inline id, concurrent edits to different tasks (no conflict). **Live smoke**
      on team SKI. Typecheck + tests green.

## Notes

Assignee/priority/exact issue state are Linear-owned — never written from the repo.
Keep the inline-id parser tolerant so specs without linked issues are unaffected.
