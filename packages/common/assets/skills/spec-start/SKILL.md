---
name: spec-start
description: Put a spec in flight — provision its branch, move it to in-progress, refresh the tracker, then build phase 1. Commits the spec itself when that is all that is uncommitted, and refuses to touch anyone else's unfinished work. Use when the user says "/spec-start", "start this spec", or "begin implementing <spec>".
---

# /spec-start — put a spec in flight

One checkout, one spec in flight. This skill is how a spec gets there:
provision, move it to `in-progress`, refresh the tracker, then hand straight on
to `/spec-next` for phase 1. Continuing a spec afterwards is `/spec-next`;
finishing it is `/spec-complete`.

## 1. The gate — refuse unless the workbench is free

**Check this first, before resolving anything or touching a file.** What the
gate demands depends on the mode, because the two modes hold work in different
places — read `mode` from `specs/.core/env.config.json` (default `worktree`).

**`worktree` mode — the tree must be clean, and that is all.** The spec is built
in its own worktree, so another spec being in flight is not a conflict; it is the
parallelism the mode exists for. The only requirement is that this checkout has
no uncommitted work — *except* the spec you are starting, which `spec-env up`
commits for you (see below). Nothing is switched here and nothing is parked.

**`checkout` mode — the workbench must be free**: on the base branch (`main`, or
the configured `baseBranch`) and clean, since the branch is built right here and
this mode holds one spec at a time. If it isn't, relay what is in flight and
stop — name the spec holding the checkout and the two ways out, then end your
turn:

- **`/spec-complete`** — it's finished; land it and free the workbench.
- **`/spec-cancel`** — it isn't wanted; record why and free the workbench.

**Never get past the gate yourself.** Do not stash, do not commit
**another spec's** work, do not switch branches for them. An uncommitted tree
and a half-built phase are each a decision someone must make deliberately — and
the cost of guessing is another spec's work moved without its author asking. A
refusal costs one command; the alternative can cost an afternoon.

**The one exception is the spec you are starting.** `spec-env up` classifies the
uncommitted tree against the target spec and answers one of three ways — relay
what it says rather than deciding for yourself:

| What it found | What it does |
|---------------|--------------|
| clean | provisions, as always |
| every path belongs to this spec | plans `git add` + `git commit` **first**, then the fork |
| any path does not | refuses, naming the paths that disqualified it |

That is membership in an exactly-known set — the spec's own folder plus the
project's `spec.companionPaths` — and **not** a judgement about whether the
changes look important. The gate still never decides that. When it plans the
commit, the paths are printed above the commands, so run them as printed; when it
refuses, relay the reason and stop.

It also refuses a **clean** tree whose spec is not in the commit the worktree
would fork from — otherwise you get a branch missing the very spec it is for.

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
- A spec already in `specs/in-progress/` was started before. Its worktree
  probably still exists, so this is a re-attach: say so rather than reporting a
  fresh start, and skip the housekeeping that is already done.

## 3. Build its branch

### `worktree` mode

**One path. There is no branching here and none should be added back.**

1. **Provision.** Run `skitterspec spec-env up <name>` — a planner, so run the
   `to provision, run:` commands it prints and confirm they succeeded.

2. **Trust the worktree.** `spec-env up` wrote the printed `trusted:` root into
   `.claude/settings.local.json`, but that file does not hot-reload in this
   session — run **`/add-dir <trusted root>`** before editing into the worktree,
   or the first write prompts. This is not tab machinery: worktrees live outside
   the checkout, and the trust entry is what stops the prompt.

3. **Bootstrap it**, with a `cd` in the command itself — one call, no session
   move:

   ```
   cd "<worktreePath>" && <the planner's "then, in the worktree, run:" steps>
   ```

   Run the seeding steps before `setup`: a fresh worktree has no dependencies and
   none of the repo's gitignored files, so hooks, typechecks and tests fail until
   both have happened.

4. **Housekeep with `git -C <worktreePath>`** — step 4 below, against the
   worktree.

5. **Print the worktree path**, and say to run **`/spec-next`** from a session in
   it.

**The session does not move, and nothing opens a window.** Starting a spec builds
a branch and tells you where it is; that is the whole job. Reading what a phase
changed is **`/spec-diff`**, which renders the worktree's diff as a page from
wherever you already are — so no part of this skill needs a shell, a tab or an
editor to be somewhere in particular.

**Do not move the branch into this checkout**, and do not ask the operator to.
`/spec-live` is for testing a finished-enough spec on the already-running dev
server; it is not how work gets started.

**`/spec-next` is unchanged by this.** Its rule 2 — "the worktree you are
standing in" — is what answers from a session in the worktree; nothing about its
resolution is loosened, and it must not be. The refusal exists so the wrong
branch is never built.

### `checkout` mode

Run `skitterspec spec-env up <name>` and the single `git switch` it prints.
There is no worktree, no bootstrap and no hand-off — the checkout is already the
workbench. Its planner enforces the same gate from the engine side, so relay any
refusal and stop.

## 4. Move the spec into development

**Do this before you report anything**, so no path can end with a provisioned
worktree and a spec still reading `Ready` in `specs/backlog/`. In `worktree` mode
run it against the worktree with `git -C <worktreePath>`; in `checkout` mode the
branch is already here.

- `git mv "specs/backlog/<name>" "specs/in-progress/<name>"` if it isn't there
  already (`mkdir -p specs/in-progress` first). Use `git mv` to keep history.
- Set the **Status** header: `> **Status:** In Progress — Phase 1 (started <YYYY-MM-DD>)`.
- Set **Developer** if it is still `—` (`git config user.name`).

<!-- seam:spec-tracker-assign -->

- Append a **State log** row: `| <YYYY-MM-DD> | In Progress | in-progress | <git user.name> |`.
- **Commit it, and push the branch.** One commit, the spec's own — it records the
  in-progress state for everyone and fires the tracker's automation. Do this
  *before* the tracker refresh below, so the snapshot that refresh writes is
  swept up by the phase's own commit rather than left dirty.

A spec ideally arrives `Ready` from `/spec`; a `Draft` works too — sanity-check
it is well-formed first.

## 4b. Note a missing gating decision (only if configured)

**Only when `specs/.core/gating.config.json` exists.** Run
`skitterspec gating check <name>` and, if it names this spec, mention it **once**
before phase 1 starts — the cheapest moment to decide is before any code exists.

**This check is advisory.** It reports; it never refuses, and nothing below is
conditional on it. A spec written before the project adopted gating has no header
and is not broken — turning this into a gate would accuse the very specs the
feature was designed not to disturb.

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

**`checkout` mode — carry straight on into `/spec-next`** in this session: it
marks phase 1 started, refreshes the mirror again, builds it with tests and
reports. Do not stop and ask the operator to run it: the branch is here and they
asked to start the spec.

**`worktree` mode — the spec is built in its worktree**, and this session did not
move there. Print the path and tell them to run **`/spec-next`** from a session
in it. Say it plainly and once; there is no second path to disambiguate from.

`/spec-next` resolves the spec it is *standing in* — the live spec of the
checkout, the worktree its cwd is inside, or the branch in `checkout` mode — and
a name argument narrows a re-run rather than selecting a spec elsewhere. That
refusal is deliberate: building the wrong spec's phase writes commits on a branch
nobody asked for. **Do not work around it**, and do not offer to build the phase
from here.

## Opt-outs

- **`--plan`** — print the provisioning and dev-server plan, change nothing.
- **`--no-worktree`** — skip provisioning and build on the current branch. Warn
  that the work lands wherever you are (usually the base branch); reserve it for
  a trivial change or an explicit request.

There is no `--here`. It existed to ask for the branch in the checkout you are
standing in — and in `checkout` mode that is already what happens, while in
`worktree` mode `--no-worktree` is the way to say it.

## Why this skill links nothing, but does record an owner

This skill creates no spec and mints no issue, so it has **nothing to link** —
the intake and picker steps belong to `/spec`, `/spec-bug` and `/spec-hotfix`.
Nor does it push: the state change it makes (the spec moving to `in-progress`)
is mirrored by the refresh `/spec-next` runs the moment it starts, which sends
the issue state and the phase states together. A push here would send the same
thing twice, one commit apart.

The **assignment** seam in step 4 is the exception, and it is not a push. This is
the one moment in the lifecycle where "who is building this" is actually decided
— the branch is being provisioned for someone, and that someone is at the
keyboard. It stamps the spec file and stops there, so it costs no tracker call and
rides out on the refresh like every other field. Deferring it to `/spec-next`
would be worse than untidy: in `worktree` mode the two can be separated by hours,
and a spec in flight with nobody named on it is exactly the gap assignment exists
to close.
