---
linear_issue_id: "SKS-122"
---

# Phase 1 — `spec-env promote`, housekeeping moves into the engine ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-env promote <spec>` performs the whole
backlog→in-progress housekeeping deterministically, proven by tests over a
fixture repo — so no skill has to edit files across a directory boundary.

## Tasks

- [ ] Add `promoteSpec(...)` in `packages/common/src/env/provision.js` (or a new
      `promote.js` if that file is already carrying too much): given a resolved
      spec, perform the bucket move and the header edits.
- [ ] Move `specs/<bucket>/<name>` → `specs/in-progress/<name>` with `git mv`
      (creating `specs/in-progress` first), so history is preserved. A spec
      already in `in-progress` is a **no-op that reports itself**, not an error —
      re-attach is a normal path.
- [ ] Set `> **Status:** In Progress — Phase 1 (started <YYYY-MM-DD>)`, set
      `> **Developer:**` from `git config user.name` when it is still `—`, and
      append the State log row `| <date> | In Progress | in-progress | <name> |`.
      Leave an already-set Developer alone.
- [ ] Operate on the **worktree**, not the primary checkout: resolve the target
      from the spec's worktree path so the caller may run it from either side.
      Take the date from the caller rather than `new Date()` at the call site, so
      tests can pin it.
- [ ] Wire `case 'promote':` into the `spec-env` dispatch and add the line to the
      usage block. Refuse an unknown spec by name rather than falling back to the
      branch.
- [ ] Print what it did (moved / already in-progress / headers set), so the skill
      can relay it instead of re-deriving it.
- [ ] Have `spec-env up` print `spec-env promote <spec>` among its
      `then, in the worktree, run:` steps, after `setup`.
- [ ] Add `packages/common/test/env-promote.test.js` covering: a backlog spec
      moved with history preserved; an already-in-progress spec reported as a
      no-op and **not** re-stamped (the stays-silent test from
      `.claude/rules/negative-checks.md` — a healthy re-run must accuse nobody);
      an already-set `Developer` left untouched; the State log row appended rather
      than replacing existing rows; and a legacy bare `<name>.md` spec handled.
- [ ] Run the project's test commands — `pnpm test` in `packages/common` and at
      the repo root — green before the phase is done. (This repo has no separate
      typecheck step.)

## Notes

The verb name is deliberately not `start`: `up` already provisions, and two verbs
whose names both mean "begin" would be read as alternatives rather than as steps.
`promote` names what it does — moves the spec up a bucket.

`stamp` and `record` in the Linear package are the reference for "the engine does
the file edits, not the model" — follow their shape (validate everything before
writing anything, exit non-zero having changed nothing on a bad input).
