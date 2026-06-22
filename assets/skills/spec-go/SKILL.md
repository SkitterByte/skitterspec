---
name: spec-go
description: Promote a spec into active development and implement its first phase. Moves the spec from backlog into specs/in-progress/, then builds phase 1 with tests. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-go", "start this spec", "begin implementing <spec>", or "let's build the next phase".
---

# /spec-go — start (or continue) implementing a spec

## 1. Identify the target spec

- If a name/path is given as an argument, use it.
- Otherwise use the spec **currently in context** (the one just created or
  discussed). If neither is clear, ask which spec.
- Locate it by searching `specs/` (check `specs/backlog/` first, then the other
  buckets). A spec is a `<name>/` folder whose entry point is `00-overview.md`
  (legacy specs may be a bare `<name>.md`).

## 2. Move it into development

- If it isn't already under `specs/in-progress/`, move the whole spec folder
  there. **Use `git mv`** to keep history:
  `git mv "specs/backlog/<name>" "specs/in-progress/<name>"`.
  `mkdir -p specs/in-progress` first if needed.
- Update the **Status** header in the entry point:
  `> **Status:** In Progress — Phase 1 (started <YYYY-MM-DD>)`.
- Set the **Developer** header field if it's still `—`: use `git config user.name`.
- Append a **State log** row:
  `| <YYYY-MM-DD> | In Progress | in-progress | <git user.name> |`.
- **Remove the spec's row from `specs/backlog/00-index.md`** — it has left the backlog
  (there is no index for `in-progress`).

A spec ideally reaches here as `Ready` (via `/spec-ready`), but `/spec-go` works
on a `Draft` too — just sanity-check it's well-formed before building.

If the spec is already in `in-progress`, skip the move and implement the **next
unfinished phase** instead of Phase 1.

## 3. Implement the phase

Build the first unfinished phase, following the spec's tasks and the project
rules in `.claude/rules/*.md` and `CLAUDE.md`:

- Work task by task. Make focused edits that match surrounding code.
- Honour the project's conventions (see `.claude/rules/spec-planning.md` and the
  rules it links).
- **Tests are part of the phase, not after it.** Create/extend tests for the
  work, then run the project's typecheck and test commands. Do not declare the
  phase done until green.
- Never hardcode dates in tests; never run destructive commands against a real
  database — use the project's test database only.

## 4. Record progress

- Tick completed tasks (`- [x]`) and flip the phase heading to `✅`.
- If anything changed from the plan (a decision, a deviation, a discovered
  constraint), add a dated **Changelog** entry in the spec.
- If new work surfaced, add it as tasks to the appropriate phase rather than
  doing it silently.

## 5. Report

Summarise what was implemented, the test result (quote failures if any), and
which phase is next. Do **not** `git commit` unless the user asks — finish,
verify, and wait.
