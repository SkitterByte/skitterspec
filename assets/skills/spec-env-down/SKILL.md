---
name: spec-env-down
description: Tear down a spec's isolated environment — stop and remove its namespaced Docker stack (optionally backing up + dropping volumes), remove its git worktree, and free its slot. Guards refuse teardown on a dirty or unpushed worktree unless --force. Runs `skitterspec spec-env down` and executes the printed commands. Opt-in — needs specs/.core/env.config.json. Use when the user says "/spec-env-down", "tear down <spec>'s environment", "clean up the worktree/stack for <spec>", or "reclaim <spec>'s slot".
---

# /spec-env-down — tear down a spec's isolated environment

Reverse `/spec-env`: stop + remove the spec's Docker stack, remove its git
worktree, and free its slot so the ports/slot are reclaimed. **Volumes are the
only destructive part** — dropped by default (to reclaim disk) unless
`--keep-volumes`, and always backed up first when `docker.backupCommand` is set.

Opt-in: only works when `specs/.core/env.config.json` exists. If absent, say so
and stop.

## 1. Identify the target spec

- Use the spec named as an argument, else the spec **currently in context**. If
  neither is clear, ask which spec.

## 2. Plan the teardown

Run the engine — it checks the guards, frees the slot, and **prints** the plan:

```
skitterspec spec-env down <spec> [--keep-volumes] [--force]
```

- **`--keep-volumes`** — keep the stack's data (plain `down`, no backup, no drop).
- **`--force`** — override the guards below.

## 3. Handle a guard block

If the CLI reports **blocked** (the worktree has uncommitted changes or unpushed
commits), **relay the reason and stop** — do not destroy unreviewed work. Offer
the user `--force` (and suggest committing/pushing first). Only re-run with
`--force` when the user explicitly asks.

## 4. Execute the printed side effects

When not blocked, run the printed commands **in order**, exactly as printed:

1. **Backup** (only when a `docker.backupCommand` is configured and volumes are
   being dropped) — writes a dump under `.spec-env/backups/` before anything is
   destroyed.
2. **`docker compose … down`** — with `--volumes` unless `--keep-volumes`.
3. **`git worktree remove …`** — removes the sibling worktree.

The slot is already freed by the CLI.

## 5. Report

Confirm what happened: worktree removed, containers down, volumes
**dropped|kept**, slot freed, and the backup path (if any). If the spec wasn't
provisioned / was already torn down, the CLI reports a clean **no-op** — relay
that; it's not an error.
