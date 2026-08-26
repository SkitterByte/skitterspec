---
name: spec-cancel
description: Cancel a spec — capture the reason, record final progress, stamp the reason on the spec header, then move it into specs/cancelled/. Targets a spec by name (arg) or the spec currently in context. Use when the user says "/spec-cancel", "drop this spec", "we're not doing this spec", or "shelve <spec>".
---

# /spec-cancel — record, stamp a reason, archive a spec

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate it under `specs/` (any bucket — `backlog/`, `in-progress/`, …). Entry point
  is its `00-overview.md`; phases are separate files (`01-<slug>.md`, `02-…`) listed
  in its phase index (legacy specs may be a bare `<name>.md`).

## 2. Ask for the cancellation reason — required

Ask the user **why** it's being cancelled (e.g. superseded by X, descoped, no
longer needed, blocked indefinitely). Do not proceed without a reason; capture
it verbatim/condensed for the header.

## 3. Double-check and record progress

- Read the overview and every phase file and reconcile task state with reality:
  tick anything that was actually completed before cancelling so the record is
  honest about what landed.
- Note any partial/abandoned work so it isn't mistaken for unstarted.

## 4. Stamp the spec

Update the **Status** header in the entry point so the reason is visible at the
top:

```
> **Status:** Cancelled (<YYYY-MM-DD>) — <reason>
```

Append a **State log** row:
`| <YYYY-MM-DD> | Cancelled | cancelled | <git user.name> |`.

Add a **Changelog** entry:
`- <YYYY-MM-DD> — Cancelled: <reason>.`

## 5. Move to cancelled

`mkdir -p specs/cancelled` then **`git mv`** the file or folder:
`git mv "specs/<bucket>/<name>" "specs/cancelled/<name>"` (preserve history;
move the whole folder).

## 6. Report

Confirm the cancellation, the reason recorded, and the new location. Do **not**
`git commit` unless the user asks.

## 7. Tear down the environment (opt-in, only if configured)

**Only when `specs/.core/env.config.json` exists**, offer — don't force — to
reclaim the cancelled spec's environment. On confirmation, run the `spec-env` CLI
directly (the old `/spec-env-down` skill is gone — teardown is folded in here):

1. If `.spec-env/connected` names this spec, run `skitterspec spec-env connect
   main` first to free the canonical ports.
2. `skitterspec spec-env dev down <name>` — stop its host dev servers.
3. `skitterspec spec-env down <name>` — then execute the printed commands to
   remove the worktree/stack and free the slot. It respects the teardown guards
   (won't destroy a dirty/unpushed worktree without `--force`).
4. `skitterspec spec-env prune` — reap orphaned test-DB volumes that belong to no
   live spec (leftovers from declined/aborted teardowns or manual worktree
   removal). Show the orphan list and, **only on the user's confirmation**, run
   the printed `docker volume rm` commands. Non-fatal: if it can't run or the user
   declines, report and finish cancelling anyway.

If `env.config.json` is absent, skip this entirely — behave exactly as before.
