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
  buckets). A spec is a `<name>/` folder whose entry point is `00-overview.md`,
  with **one file per phase** alongside it (`01-<slug>.md`, `02-…`). Legacy specs
  may be a bare `<name>.md`, or a `00-overview.md` with inline phases — handle
  those too.

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

## 3. Pre-flight — commit prior work, then compact

Before writing any code for this phase, get the workspace and context clean:

- **Confirm the last-worked phase is committed.** Run `git status` and
  `git log --oneline -5`. The most recently *implemented* phase (not necessarily
  the numerically previous one) should already be committed. If prior-phase work
  is still uncommitted, **stop and suggest committing it first** (e.g. via
  `/commit`) so each phase lands as its own reviewable commit — don't build the
  next phase on top of an uncommitted one. (Skip if this is the first phase —
  there's nothing prior to commit.)
- **Compact, then continue.** Recommend the user run `/compact` now. A fresh,
  minimal context keeps the phase focused and avoids drift from earlier turns;
  the spec file on disk is the source of truth, so nothing is lost. Pause for the
  `/compact`, then implement the phase.

## 4. Implement the phase

Identify the **first unfinished phase** from the `00-overview.md` phase index,
then open its phase file (`0N-<slug>.md`) — that file holds the tasks. Mark it
started: set the phase-file heading to `🔄` and its `> **Status:**` to
`In progress`, and flip the matching row in the overview phase index to `🔄`.
Then build it, following the project rules in `.claude/rules/*.md` and `CLAUDE.md`:

- Work task by task through the phase file. Make focused edits that match
  surrounding code.
- Honour the project's conventions (see `.claude/rules/spec-planning.md` and the
  rules it links).
- **Tests are part of the phase, not after it.** Create/extend tests for the
  work, then run the project's typecheck and test commands. Do not declare the
  phase done until green.
- Never hardcode dates in tests; never run destructive commands against a real
  database — use the project's test database only.

## 5. Record progress

- In the **phase file**: tick completed tasks (`- [x]`), flip its heading to `✅`,
  and set its `> **Status:**` to `Done`.
- In **`00-overview.md`**: flip the matching phase-index row to `✅`.
- If anything changed from the plan (a decision, a deviation, a discovered
  constraint), add a dated **Changelog** entry in `00-overview.md`.
- If new work surfaced, add it as tasks to the appropriate phase file (or add a
  new phase file + index row) rather than doing it silently.

## 6. Report

Summarise what was implemented, the test result (quote failures if any), and
which phase is next. Do **not** `git commit` unless the user asks — finish,
verify, and wait.
