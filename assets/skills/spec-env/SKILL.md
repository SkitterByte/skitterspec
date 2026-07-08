---
name: spec-env
description: Provision an isolated environment for a spec — a git worktree on its own branch + a namespaced Docker stack (isolated containers/networks/volumes + a reserved port block), plus an optional editor/terminal opener. Runs `skitterspec spec-env up` and executes the printed git/docker/open commands. Opt-in — needs specs/.core/env.config.json. Use when the user says "/spec-env", "spin up an environment for <spec>", "give this spec its own worktree/stack", or "isolate <spec>".
---

# /spec-env — provision an isolated environment for a spec

Give an in-progress spec its own **git worktree** (a sibling directory on its own
branch, no stashing) + a **namespaced Docker stack** (`COMPOSE_PROJECT_NAME`
isolates containers/networks/volumes; `PORT_OFFSET` reserves a port block), so N
specs run side by side and `main` stays clean. An optional `open.command` then
opens the worktree however you like.

This skill is **opt-in**: it only works when `specs/.core/env.config.json` exists
(copy `env.config.json.example` to adopt it). If it's absent, tell the user how
to enable it and stop.

## 1. Identify the target spec

- Use the spec named as an argument, else the spec **currently in context**. If
  neither is clear, ask which spec.

## 2. Plan the environment

Run the engine — it allocates the slot (idempotent), persists the registry, and
**prints** the plan (worktree path, branch, project name, port block, the exact
commands, the `.env` contents, and the opener):

```
skitterspec spec-env up <spec>
```

If it reports the feature isn't enabled, relay that and stop — do not hand-roll a
worktree/stack.

## 3. Execute the printed side effects

Run the printed commands **in order**, exactly as printed:

1. **`git worktree add …`** — creates the sibling worktree on its branch. It is a
   **sibling** of this checkout, **never nested** inside it. If the worktree
   already exists, the engine prints the *attach* form (no `-b`) — do not clobber
   an existing worktree/branch.
2. **Write the `.env`** — write the printed `.env` contents into the new
   worktree's env file (default `.env`). Do this *after* the worktree exists.
3. **`docker compose … up -d`** — only printed when Docker is enabled. Brings the
   namespaced stack up in the spec's reserved port block.
4. **Opener** — if an `open.command` line was printed, run it (e.g. opens the
   worktree in your editor/terminal). Skipped silently when unset.

## 4. Report

Echo the summary: worktree path, branch, project name, the allocated slot + port
block, and whether the stack was brought up. **Idempotent** — re-running attaches
to the existing slot/worktree and never reallocates.

Tear down later with `/spec-env-down <spec>`.
