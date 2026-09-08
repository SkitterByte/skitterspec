---
name: spec-start
description: Put a spec in flight on this checkout — provision its branch, move it to in-progress, refresh the tracker, then build phase 1. Refuses unless the checkout is on the base branch with nothing already in flight, so it never parks or swaps someone's unfinished work. Use when the user says "/spec-start", "start this spec", or "begin implementing <spec>".
---

# /spec-start — put a spec in flight

One checkout, one spec in flight. This skill is how a spec gets there:
provision, move it to `in-progress`, refresh the tracker, then hand straight on
to `/spec-next` for phase 1. Continuing a spec afterwards is `/spec-next`;
finishing it is `/spec-complete`.

## 1. The gate — refuse unless the workbench is free

**Check this first, before resolving anything or touching a file.** In
`worktree` mode run `skitterspec spec-env live status`; in `checkout` mode read
the current branch. The workbench must be:

- **on the base branch** (`main`, or the configured `baseBranch`), and
- **clean** — no uncommitted changes.

**If it isn't, relay what is in flight and stop.** Name the spec holding the
checkout and the three ways out, then end your turn:

- **`/spec-complete`** — it's finished; land it and free the workbench.
- **`/spec-cancel`** — it isn't wanted; record why and free the workbench.
- **`/spec-live main`** *(worktree mode)* — park it: the branch goes back to its
  worktree and stays exactly as it is, ready to resume later.

**Never get past the gate yourself.** Do not stash, do not commit on the
operator's behalf, do not `/spec-live main` for them, do not switch branches. An
uncommitted tree, a half-built phase and a rebase are each a decision someone
must make deliberately — and the cost of guessing is another spec's work moved
without its author asking. A refusal costs one command; the alternative can cost
an afternoon.

A dirty tree is refused *with the same words whatever the cause*: the gate does
not try to judge whether the changes look important.

## 2. Identify the spec

- Use the name/path argument when given.
- Otherwise use the spec **in context** (the one just created or discussed).
  Unlike `/spec-next`, that fallback is safe here: this skill starts nothing
  without the gate above passing, and a wrong guess is caught by the operator
  before any code is written.
- Locate it under `specs/` — `specs/backlog/` first, then the other buckets. A
  spec is a `<name>/` folder whose entry point is `00-overview.md`, with one
  file per phase beside it (`01-<slug>.md`, `02-…`). Legacy specs may be a bare
  `<name>.md`, or a `00-overview.md` with inline phases — handle those too.
- A spec already in `specs/in-progress/` was started before. If its branch is
  parked in a worktree, this skill brings it back into flight; say so rather
  than reporting a fresh start.

## 3. Put its branch in this checkout

**Read `mode` from `specs/.core/env.config.json`** (default `worktree`).

### `worktree` mode

1. **Provision.** Run `skitterspec spec-env up <name>` — a planner, so run the
   `to provision, run:` commands it prints and confirm they succeeded. Then run
   its **`then, in the worktree, run:`** steps in order (file seeding, then
   `setup`): a fresh worktree has no dependencies and none of the repo's
   gitignored files, so hooks, typechecks and tests fail until they are there.
2. **Bring the branch here.** Tell the user to type **`/spec-live <name>`** — it
   rebases the branch, frees it from the worktree and checks it out in this
   checkout, which is what makes this session the workbench. It is a user-only
   command, so you cannot run it: print it, end your turn, and pick up at step 4
   when they re-run `/spec-start`.
   **Already here?** If the live check in step 1 showed this spec live, or the
   branch is already checked out, the move is done — carry straight on.
3. **A spec the live overlay refuses** — a hotfix, a stateful spec
   (`Stack: worktree + docker`), or a branch touching migrations — **parks
   instead.** Do the housekeeping in step 4 with `git -C <worktreePath>`, run
   `open.command` if configured, print the worktree path, and say to run
   `/spec-next` from a session there. Relay the engine's refusal reason as it
   printed it; those guards protect a shared dev instance and are not yours to
   weaken.

### `checkout` mode

Run `skitterspec spec-env up <name>` and the single `git switch` it prints.
There is no worktree, no bootstrap, no live step — the checkout is already the
workbench. Its planner enforces the same gate from the engine side, so relay any
refusal and stop.

## 4. Move the spec into development

On the branch, in this checkout (or via `git -C <worktreePath>` for a parked
spec):

- `git mv "specs/backlog/<name>" "specs/in-progress/<name>"` if it isn't there
  already (`mkdir -p specs/in-progress` first). Use `git mv` to keep history.
- Set the **Status** header: `> **Status:** In Progress — Phase 1 (started <YYYY-MM-DD>)`.
- Set **Developer** if it is still `—` (`git config user.name`).
- Append a **State log** row: `| <YYYY-MM-DD> | In Progress | in-progress | <git user.name> |`.
- **Commit it, and push the branch.** One commit, the spec's own — it records the
  in-progress state for everyone and fires the tracker's automation. Do this
  *before* the tracker refresh below, so the snapshot that refresh writes is
  swept up by the phase's own commit rather than left dirty.

A spec ideally arrives `Ready` from `/spec`; a `Draft` works too — sanity-check
it is well-formed first.

## 5. Bring the spec's dev servers up — confirm before heavy steps

**Only when the project configures host dev servers** (`env.config.json` → a
non-empty `dev` array). Show what will start — the commands, the ports, any
Docker stack — and get a yes; on **`--plan`**, print it and stop. On
confirmation run `skitterspec spec-env dev up <name>`. With none configured this
is a clean no-op.

To reach the spec at your normal `localhost` URL afterwards, the **user** types
**`/spec-connect <name>`** (`/spec-connect main` hands the ports back). Never
invoke it yourself.

## 6. Build phase 1

**Carry straight on into `/spec-next`** in this session: it marks phase 1
started, refreshes the mirror again, builds it with tests and reports. Do not
stop and ask the operator to run it — the workbench is set up and they asked to
start the spec.

## Opt-outs

- **`--plan`** — print the provisioning and dev-server plan, change nothing.
- **`--no-worktree`** — skip provisioning and build on the current branch. Warn
  that the work lands wherever you are (usually the base branch); reserve it for
  a trivial change or an explicit request.

There is no `--here`: `/spec-start` **is** here. It puts the branch in the
checkout you are in, which is what the old opt-out was reaching for.

## Why there is no tracker seam here

This skill creates no spec and mints no issue, so it has nothing to link — the
intake and picker steps belong to `/spec`, `/spec-bug` and `/spec-hotfix`. The
state change it *does* make (the spec moving to `in-progress`) is mirrored by
the refresh `/spec-next` runs the moment it starts, which pushes the issue state
and the phase states together. Adding a push here would send the same thing
twice, one commit apart.
