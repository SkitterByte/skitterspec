# Isolation, worktrees and the live overlay

Applies only when `specs/.core/env.config.json` exists. Without it, every skill
works in the checkout it is standing in.

## Workspace modes (`mode` in `env.config.json`)

- **`worktree`** (the default): each spec gets its own checkout, so several can
  be in flight and `main` stays free. `/spec-start` builds the branch there,
  moves the session in with a plain `cd`, and asks whether to build phase 1. The
  primary checkout stays on the base branch, so the base branch still shows an
  in-flight spec under `backlog`. `skitterspec status` reads each worktree's own
  copy.
- **`checkout`**: the branch is built in the primary checkout, one spec at a
  time, and the build carries straight on. `/spec-connect` and `/spec-live` do
  not apply and say so.

**Omit the spec name anywhere** and the engine uses the worktree you are
standing in, or else the only provisioned spec.

## Per-spec isolation

`/spec-start` gives every in-progress spec its own worktree. Docker is a
per-spec escalation: `> **Stack:** worktree` (the default) or
`worktree + docker` when the spec touches the database or stateful services.
`/spec-start` brings up a namespaced stack only for the latter, and starts the
host **dev servers** (`dev` in `env.config.json`) on the spec's ports.
`/spec-connect <name>` maps that spec onto your normal `localhost` ports, and
`/spec-connect main` hands them back. Teardown is part of `/spec-complete` and
`/spec-cancel`, which drop the spec's test-DB volume and offer to prune orphans
first.

The engine is `skitterspec spec-env
<up|bootstrap|nospec|main|project|down|prune|dev|connect|integrate|disposition|handoff|hotfix|live|review|stage|checks|status|resolve|resume|base>`.
`up` plans the fork, and **`bootstrap` runs the worktree's own steps**: seeding
the gitignored files, the env file, `setup` and the stack. Never reconstruct
those steps as shell commands.

A **hotfix** is the one spec that does not fork from `main`. `/spec-hotfix` forks
from a release tag, and `/spec-complete` lands it through `spec-env hotfix land`
(release, push on consent, carry to `main` without the version commit). Its
worktree stays until the deploy is out and a second `/spec-complete` runs
`spec-env hotfix finish`.

## The live overlay (`/spec-live`)

`/spec-connect` runs a spec's own dev stack. The live overlay instead reuses the
dev server you already have running. `/spec-live <spec>`, or a bare
`/spec-live`, rebases the branch onto the base (the fetched remote base under PR
landing), frees it from its worktree, and checks it out
**in the primary checkout**, so the running server hot-reloads it. The checked-out branch is the
lock, so only one spec is live at a time. `/spec-live main` hands the checkout
back. Fixes made while live commit straight onto the branch, and
`/spec-complete` knows about live specs and lands them.

- It is for **testing** a code-only spec, not for starting work, and no
  lifecycle skill invokes it.
- It **refuses** stateful specs (`Stack: worktree + docker`, or a branch that
  touches migrations). Use `/spec-connect` and a Docker stack for those.
- `live.afterSwitch` entries (`{ run, when }`) run in the primary checkout after
  taking and after releasing. The engine runs them itself.
- The engine is `skitterspec spec-env live <take|release|abort|status>`.

## Authoring a spec off the base branch

With isolation, `/spec` grills first, then runs `spec-env up <name> --docs`,
moves into that worktree and writes the spec there. `--docs` skips `setup` and
Docker, so the tree costs one `git worktree add`. `/spec-start` later re-runs
`up` without the flag, and the install happens then.

Both committing verdicts on the authoring page (`Commit & Start`, `Commit`)
commit on the branch, then `spec-env integrate` rebases and fast-forwards, so
the base gains the spec as one commit. `Commit & Start` keeps the worktree and
carries into `/spec-start`. `Commit` tears it down. The authoring page arms
nothing, because a backlog spec owes no phase.

**`land.specDocs: "branch"`** (the default once a ticketing provider is
configured and the key is unset) keeps the spec on its feature branch, to land
with the work. Both verdicts commit and skip the integrate, plain `Commit` keeps
the branch and worktree, and the backlog is found through the tracker. Setting
the key, to either value, always wins.

## Staging one spec and not another

`skitterspec spec-env stage [<spec>] [--json]` splits the uncommitted tree you
are standing in into what belongs to this spec and what does not. **Owned** is
the spec's folder in any bucket plus each `spec.companionPaths` entry. Code is
always **foreign**, because the commits this bounds are the lifecycle ones.
Nothing here refuses. Commit with the pathspec on both `git add` and
`git commit`.
