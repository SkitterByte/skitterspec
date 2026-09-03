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

**Live check first (isolation only).** If per-spec isolation is enabled, before
provisioning run `skitterspec spec-env live status <name>` and read its `live:`
line. If it says **`live: yes`**, this spec is already checked out in the
**primary checkout** (you took it live with `/spec-live`) — **do not provision,
do not run `spec-env up`, and do not "work in the worktree"**. Its branch lives
in the primary checkout and its worktree is on a **detached HEAD**, so a commit
made in the worktree would strand on that detached HEAD and never reach the
branch. Instead skip the provisioning bullets and step 2b, leave the spec where
it is, and go straight to **step 4**, implementing the phase **in the primary
checkout on the branch** — edits and commits there advance the branch, and
`/spec-complete` lands them. (`spec-env up` refuses while live and says the same.
To return to an isolated worktree instead, run `/spec-live main` first, then
re-run `/spec-go`.)

**If per-spec isolation is enabled** (`specs/.core/env.config.json` exists), the
spec **isn't already live** (the check above), and it doesn't already have a
worktree, provision it **first**, so all the housekeeping below lands on the
spec's branch and never on `main`:

**Opt-out:** if the user passes `--no-worktree` (or explicitly asks to work in
place), skip the provisioning bullets below and build on the current branch — the
same "in place otherwise" path used when isolation is off. Warn that the work
will land wherever you currently are (usually `main`); reserve it for a trivial
change or an explicit request.

- Run `skitterspec spec-env up <name>` (the `spec-env` CLI engine). It is a
  **planner: it prints commands and creates nothing itself.** Under
  `to provision, run:` it emits the `git worktree add` on a branch forked from
  `main` and — only when the spec's `> **Stack:**` header is
  `worktree + docker` — the Docker bring-up.
  **Run those commands and confirm they succeeded** before anything below: every
  later step assumes the worktree exists, and the header line says
  `(plan — nothing created yet)` precisely because at that point it doesn't.
  Print the worktree path and the opener command it emits.
- **Bootstrap the worktree's dependencies.** A fresh worktree has an empty
  working tree — no installed dependencies, and none of the repo's gitignored
  files (`.env`, local secret/config overrides) — so git hooks, typechecks,
  builds and tests fail until they're in place. `spec-env up` prints the
  project's configured **`then, in the worktree, run:`** commands — run them in
  order, before doing anything else. Each one begins by `cd`-ing into the
  worktree, so it works from any cwd and cannot quietly act on the main
  checkout; if the worktree is missing it prints
  **`no worktree at … — run the provisioning commands first`** and exits
  non-zero. Seeing that means the `git worktree add` above didn't run or didn't
  work — fix that before going on. Those commands are: first any
  **file seeding** (from `env.config.json` → `seedFiles`), which symlinks or
  copies the configured gitignored files from the main checkout into the fresh
  worktree so setup can rely on them; then the **`setup`** commands (e.g. an
  install command). With neither configured there's nothing to run; add
  `seedFiles`/`setup` if agents keep stalling on a missing `.env` or dependencies.
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
  never seizes the canonical ports on its own. For a **code-only** spec, the
  lighter **`/spec-live <name>`** reuses your already-running dev server (a
  branch-switch, no second stack) — `/spec-live main` hands it back.

## 3. Pre-flight — commit prior work

Before writing any code for this phase, get the workspace clean:

- **Confirm the last-worked phase is committed.** Run `git status` and
  `git log --oneline -5`. The most recently *implemented* phase (not necessarily
  the numerically previous one) should already be committed. If prior-phase work
  is still uncommitted, **stop and suggest committing it first** (e.g. via
  `/commit`) so each phase lands as its own reviewable commit — don't build the
  next phase on top of an uncommitted one. (Skip if this is the first phase —
  there's nothing prior to commit.)

## 4. Implement the phase

Identify the **first unfinished phase** from the `00-overview.md` phase index,
then open its phase file (`0N-<slug>.md`) — that file holds the tasks. Mark it
started: set the phase-file heading to `🔄` and its `> **Status:**` to
`In progress`, and flip the matching row in the overview phase index to `🔄`.

**Then sync with the tracker (only if a provider is installed).** The phase has
just changed state, so refresh the mirror before the build starts — that is what
makes the phase show as in progress *while* it is being built rather than only
once it is over. Without a provider this is a no-op and nothing below changes.

<!-- seam:spec-go-start -->

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

**Then refresh the mirror (only if a provider is installed).** The phase is done
in the repo now; leaving the tracker to catch up at `/spec-complete` is what makes
a mirror lag a whole spec behind. Without a provider this is a no-op.

<!-- seam:spec-tracker-progress -->

## 6. Report

Summarise what was implemented, the test result (quote failures if any), and
which phase is next. Do **not** `git commit` unless the user asks — finish,
verify, and wait.
