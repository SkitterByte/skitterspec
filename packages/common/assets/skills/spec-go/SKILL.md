---
name: spec-go
description: Promote a spec into active development and build the next phase — provisions its worktree, brings up its host dev servers (confirm first), then implements the phase with tests. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-go", "start this spec", "begin implementing <spec>", or "let's build the next phase".
---

# /spec-go — start (or continue) implementing a spec

The "up" button: it promotes the spec, provisions its worktree, brings its host
dev servers up on the spec's reserved ports (with your OK), then builds the phase.
Diverting your browser to the spec is a separate explicit step — `/spec-connect`.

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

- Run `skitterspec spec-env up <name>` (the `spec-env` CLI engine). It adds a git
  worktree on a branch forked from `main`, and — only when the spec's
  `> **Stack:**` header is `worktree + docker` — also brings up its Docker stack.
  Print the worktree path and the opener command it emits.
- **Bootstrap the worktree's dependencies.** A fresh worktree has an empty
  working tree — no installed dependencies — so git hooks, typechecks, builds and
  tests fail until they're installed. `spec-env up` prints the project's
  configured **`in the worktree, run:`** commands (from `env.config.json` →
  `setup`, e.g. an install command) — run them in the worktree before doing
  anything else. With no `setup` configured there's nothing to run; set one up if
  agents keep stalling on missing dependencies.
- **Trust the worktree for this session.** The engine wrote the printed
  `trusted:` root into `.claude/settings.local.json` (gitignored) so future
  sessions trust it automatically — but that file likely won't hot-reload now,
  so run `/add-dir <trusted root>` before editing into the worktree, or the
  first edits will prompt.
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
  the in-progress state for everyone and fires the tracker's automation (when a
  ticketing provider is linked).

A spec ideally reaches here already `Ready` (written by `/spec`), but `/spec-go`
works on a `Draft` too — just sanity-check it's well-formed before building.

If the spec is already in `in-progress`, skip the move and implement the **next
unfinished phase** instead of Phase 1. (When isolated, subsequent `/spec-go` runs
happen from inside the worktree — where the spec already sits in `in-progress` on
the branch — and a re-run of `spec-env up` just re-attaches it.)

## 2b. Bring the spec's dev servers up — confirm before heavy steps

**Only when isolation is enabled and the project configures host dev servers**
(`env.config.json` → a non-empty `dev` array). This is what makes the spec
runnable — its UI/API on the spec's reserved port block, isolated from `main`.

- **Show the plan and get a yes first.** List what will start: the per-process
  dev commands, the ports they'll bind (the spec's slot block), and any Docker
  stack. Don't start heavy processes silently. If the user passed **`--plan`**,
  print this plan and **stop** (preview only).
- On confirmation, run `skitterspec spec-env dev up <name>` — it launches each
  dev process detached on its port, logs to `.spec-env/logs/`, and waits on each
  `health` check. With no `dev` configured it's a clean no-op; skip this step.
- **Diverting your browser is a separate step.** To test the spec at your normal
  `localhost` URL, run **`/spec-connect <name>`** (exclusive — it exposes this
  spec on the canonical ports; `/spec-connect main` hands them back). `/spec-go`
  never seizes the canonical ports on its own.

## 3. Pre-flight — commit prior work

Before writing any code for this phase, get the workspace clean:

- **Confirm the last-worked phase is committed.** Run `git status` and
  `git log --oneline -5`. The most recently *implemented* phase (not necessarily
  the numerically previous one) should already be committed. If prior-phase work
  is still uncommitted, **stop and suggest committing it first** (e.g. via
  `/commit`) so each phase lands as its own reviewable commit — don't build the
  next phase on top of an uncommitted one. (Skip if this is the first phase —
  there's nothing prior to commit.)

## 3b. Pull from the tracker first (only if a provider is installed)

**Only when a ticketing provider with a `/spec-pull` skill is installed** and the
spec is linked to the tracker. Otherwise skip this step — no provider means zero
change to the flow below. Follow the provider's pull steps below (nothing to do
here without one).

<!-- seam:spec-go-pull -->

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
