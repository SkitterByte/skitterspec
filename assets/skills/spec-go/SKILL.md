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

**If per-spec isolation is enabled** (`specs/.core/env.config.json` exists) and
the spec doesn't already have a worktree, provision it **first**, so all the
housekeeping below lands on the spec's branch and never on `main`:

- Run `skitterspec spec-env up <name>` (the `/spec-env` engine). It adds a git
  worktree on a branch forked from `main`, and — only when the spec's
  `> **Stack:**` header is `worktree + docker` — also brings up its Docker stack.
  Print the worktree path and the opener command it emits.
- **Do the rest in the worktree**, on the branch: open it (the printed opener, or
  a fresh Claude session rooted there) or, staying in this session, act on the
  worktree path with absolute paths / `git -C <worktreePath>`. The spec move,
  header edits **and** the phase's code all happen on the branch — so the spec's
  evolution travels with the code it describes and lands in one PR. `main` changes
  only when that branch merges (at `/spec-complete`).

Then move the spec (in the worktree when isolated, in place otherwise):

- If it isn't already under `specs/in-progress/`, move the whole spec folder
  there. **Use `git mv`** to keep history:
  `git mv "specs/backlog/<name>" "specs/in-progress/<name>"`.
  `mkdir -p specs/in-progress` first if needed.
- Update the **Status** header in the entry point:
  `> **Status:** In Progress — Phase 1 (started <YYYY-MM-DD>)`.
- Set the **Developer** header field if it's still `—`: use `git config user.name`.
- Append a **State log** row:
  `| <YYYY-MM-DD> | In Progress | in-progress | <git user.name> |`.
- **When isolated:** commit the move and **push the branch** now — that records
  the in-progress state for everyone and fires Linear's automation (when linked).

A spec ideally reaches here as `Ready` (via `/spec-ready`), but `/spec-go` works
on a `Draft` too — just sanity-check it's well-formed before building.

If the spec is already in `in-progress`, skip the move and implement the **next
unfinished phase** instead of Phase 1. (When isolated, subsequent `/spec-go` runs
happen from inside the worktree — where the spec already sits in `in-progress` on
the branch — and a re-run of `spec-env up` just re-attaches it.)

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

## 3b. Sync from Linear first (opt-in)

**Only when `specs/.core/linear.config.json` exists** and the spec carries a
`linear_project_id` in its `00-overview.md` frontmatter. Otherwise skip this
step — no config means zero change to the flow below.

- **Run `/spec-pull` first.** Bring down anything Linear changed since the last
  sync (status, priority, discussion-driven fields) so you build against the
  current shared state, not a stale snapshot. On a conflict it refuses — relay
  that and let the user resolve before continuing; do not `--force` for them.
- **Commit the refreshed snapshot** into the feature branch (a small
  `chore(spec): pull latest from Linear`-style commit) so the frozen spec rides
  in the PR alongside the code it describes.
- Linear's GitHub branch/PR automation may now drive status transitions off the
  branch and PR you pushed in step 2 — expect state to move on the Linear side;
  keep any manual status edits minimal to avoid fighting it.

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
