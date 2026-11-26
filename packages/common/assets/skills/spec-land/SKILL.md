---
name: spec-land
description: Trunk mode — land an in-progress spec's branch onto the base branch WITHOUT finishing it — rebase + fast-forward so the work reaches the base (for CI or a shared test env), while the worktree stays and the spec stays In Progress. Repeatable. Targets a spec by name (arg) or the spec in context. Use when the user says "/spec-land", "land this but keep going", or "I need this on the base to test before finishing".
disable-model-invocation: true
---

# /spec-land — land the branch on the base, keep the spec open

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

The **intermediate** landing. `/spec-complete` also lands the branch, but then
verifies every phase, flips the status to Complete, `git mv`s the spec to
`complete/`, and tears the environment down.
**`/spec-land` stops after the land**: the worktree stays, the spec stays
`In Progress`, and you can land again as you add commits.

Use it when a later phase can only be done *after* the current work is on the base branch —
e.g. it needs to run in CI, a deploy pipeline, or a shared test environment that
builds from the base branch. Land what you have, run that step, then come back and finish
the remaining phases with `/spec-next` and eventually `/spec-complete`.

It reuses the **same engine** as `/spec-complete`'s landing (`spec-env integrate`
— rebase + fast-forward), so it produces identical linear history. Because a
fast-forward leaves `base == branch`, the operation is
**idempotent and repeatable**: new commits put the branch ahead of base again,
and you can run `/spec-land` as many times as you like.

**Trunk mode only.** In PR mode (`land.strategy: "pr"`) the base moves when
the host merges, never from here: the mid-spec share is **`/spec-pr`**, which
pushes the branch as a draft PR.

## 0. Preconditions — when this applies

- **Not PR mode.** Where `land.strategy` is `"pr"`, stop `⏸` changing nothing:
  `Why` is that the base moves by PR here, and `Next` is `/spec-pr`. A
  project that mixes routes passes `--strategy ff` to land this spec locally
  anyway; carry it into every `spec-env integrate` below.

- **Isolation must be on** (`specs/.core/env.config.json` exists **and** the spec
  was provisioned by `/spec-start` — a worktree, or its branch in the checkout under
  `mode: checkout`). If isolation is absent, there is nothing to land — the spec
  is authored directly on the base branch already. Say so and stop. `spec-env integrate`
  reads `mode` and emits the matching plan; in checkout mode it rebases in place,
  switches to base and fast-forwards, all in the one repo.
- **Feature / Bug specs only.** A **Hotfix** (`Type: Hotfix`) is built on a
  release *tag* and cannot fast-forward onto the base branch — refuse it and point the user
  at `/spec-complete` (it lands a hotfix via tag + cherry-pick). Check the header
  `> **Type:**` before proceeding.

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate its folder under `specs/in-progress/`. Entry point is `00-overview.md`;
  confirm `> **Status:**` is `In Progress` and `> **Type:**` is `Feature` or
  `Bug`.

## 2. Require a clean worktree

The land rebases the branch — it refuses a dirty tree. If the worktree has
uncommitted changes, offer `/commit` and **stop**; don't auto-commit.

**If the spec is live** (you took the running instance with `/spec-live`):
`integrate` is live-aware — it ends the live session first (releases the branch
back to base, re-isolates it into its worktree, clears the receipt), then prints
the landing plan. Commit any live fixes to the branch first; it refuses if the
primary checkout is dirty, or if a *different* spec holds it (release that one with
`/spec-live off`, which the user types).

## 3. Tests must be green before landing

Don't push red to the base branch. Run the project's typecheck and test commands
**in the worktree**; the suite must be **green**. For a **Bug** spec, confirm
the originally-failing test now passes. If anything is red, stop and report —
landing broken code onto the base branch defeats the purpose.

(Note this is the *worktree* suite. The whole point of this skill is often to run
a *further* check that only exists on the base branch / in CI — that one runs **after** the
land, in step 5.)

## 4. Land — rebase + fast-forward

Run `skitterspec spec-env integrate <name>` and run the printed commands
**in order**:

- `git -C <worktree> rebase <base>` — replay the branch onto base.
- `git -C <mainRepoPath> merge --ff-only <branch>` — fast-forward base.

On a **rebase conflict** (non-zero exit), run `git -C <worktree> rebase --abort`,
relay the conflict, and **stop** — leave the resolution to the user; change
nothing else.

On a **no-op** ("already landed on `<base>` — nothing to integrate"), just say so
and continue — the branch has no commits base doesn't already have.

**When the plan carries `re-verify:` lines**, the rebase is about to bring in
something a **built** phase waited on — that phase was built without its
dependency underneath, and a clean rebase does not prove it works on top of it.
So after the rebase and **before** the fast-forward, run the project's test
command **in the worktree**. Green → carry on with the fast-forward. Red →
**stop before the fast-forward**, leaving the rebased branch where it is, relay
the failure, and end `❌`: base has not moved. A `re-verify: cannot tell` line is
relayed as information — it claims nothing, so it adds no run. (spec feat-epics,
Decision 9.)

**Under a rolling base** (`baseBranchPattern` in `env.config.json`) the plan
can carry two more things, and both are the engine's to say:
- a `git -C <mainRepoPath> switch <base>` (or `switch -c … --track`) **first**,
  when the primary checkout still has an older release candidate out — run it
  in order with the rest;
- a `retarget:  forked from <old> · landing onto <new>` line, when the rc
  rolled while this spec was in flight. It is the land working, not a fault:
  relay it verbatim in the `Landed` row so the reader sees where the work went.

A refusal naming `no branch matches <pattern>` means no release candidate is
visible. Where it carries an `offer:` line it is the gap between release
branches: relay it, then offer it as `.claude/rules/offered-unblocks.md`
describes — its label and Cancel — and on the pick run
`skitterspec spec-env base --use-fallback` and retry the land. With no offer it
is usually not fetched: relay it, stop with `⏸`, and name
`skitterspec spec-env base` (it fetches and lists) as the next step.

**Then run the after-land commands.** Where the plan ends with a
`then, in the primary checkout (<path>), run:` section — the project's
`afterLand`, such as a data migration — run those commands in that directory,
in order, after the fast-forward and **before** the re-test below, which may
need them. Run only the lines under that heading; a
`skipped (nothing in the land matched):` block lists conditional entries this
land did not need, and is information, never commands. Run them on the no-op too: the engine prints them there because a
land made elsewhere leaves them pending here.
**Stop at the first non-zero exit**, and carry on with §5: a failure makes the run `⚠️`, naming the command
that failed and the ones that did not run, and it **never undoes the land**.
No section, nothing to run, and nothing to say about it.

## 5. Re-test on base, then report

- Run the project's test command **from the primary checkout** — base must be
  **green** after the fast-forward.
- Add a **Changelog** entry to `00-overview.md` recording the intermediate land
  and *why*, e.g.
  `- <YYYY-MM-DD> — Landed intermediate work onto <base> to <run CI / deploy to
  test env / …>; spec stays In Progress.`
- Do **NOT**: add a State-log row (status doesn't change), flip any phase/status
  to Complete, `git mv` the spec, or tear down the worktree/stack.
  **The spec stays `In Progress` and the worktree stays put.**
- It **never pushes** — say the user can `git push` the base branch themselves to
  trigger CI / the shared env.
- `Next` points the way forward: `/spec-next` to continue the remaining phases
  (you'll keep committing on the same branch and can `/spec-land` again), and
  `/spec-complete` when every phase is genuinely done — it will land the final
  commits, finalise, and tear down.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the branch is on the base and the base is green.
- `⚠️` — landed, with something worth knowing — an after-land command that
  failed, for one.
- `❌` — the rebase conflicted, or the base went red after the fast-forward.
  Quote it; the repo is mid-something and that is what the reader needs.
- `⏸` — a dirty worktree, red tests, or no spec to land. Nothing moved.

**Fields:** `Branch` · `Tests` · `Notes` · `Landed` · `Follow-ups` · `Next`

`Notes` carries the after-land commands §4 ran, and where, and any it
skipped because the land matched no `when` — or the one that failed and the ones that did not run. Nothing about it when none are
configured.

`Landed` names the base and the commit it fast-forwarded to.

**No `Spec` field, deliberately.** This skill changes no status and moves no
folder, and a `Spec` line here would read as though it had. The spec stays
`In Progress` and the worktree stays standing — if that needs saying, the
verdict clause says it.
