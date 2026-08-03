---
name: spec-live
description: Test a spec on your already-running dev server by checking its branch out in the primary checkout — no second stack, no proxy. `spec-live <spec>` takes the running instance for that spec; `spec-live main` releases it. Runs `skitterspec spec-env live`. Opt-in — needs specs/.core/env.config.json. Code-only specs; stateful (Docker/migration) specs use /spec-connect. Use when the user says "/spec-live", "go live with <spec>", "take the instance for <spec>", or "test <spec> on the running server".
---

# /spec-live — put one spec live on the running instance

Instead of running a second dev stack for a spec (that's `/spec-connect`), **reuse
the one instance you already have**: rebase the spec's branch onto base, hand it
from its worktree to the **primary checkout**, and let your running dev server
hot-reload it. You test at your normal URL, with one process. The branch that's
checked out in the primary checkout **is** the lock — exactly one spec is live at
a time, and `/spec-live main` hands the instance back.

This skill is **opt-in**: it needs `specs/.core/env.config.json`. If isolation is
absent, say so and stop.

**Code-only.** Live overlay refuses a **stateful** spec — one whose `> **Stack:**`
is `worktree + docker`, or whose branch changes migrations (per
`env.config.json` → `live.migrations`). Those keep their isolated stack; use
`/spec-connect` for them. The engine enforces this and prints why.

## 1. Identify the target

- Use the spec named as an argument. The literal `main` means **release** (hand
  the instance back to base). Else use the spec **currently in context**; if
  unclear, ask.

## 2. Make sure a dev server is running

`live take` **verifies** a dev server is up on your canonical ports and switches
the branch under it — it does **not** start one. If nothing is listening it
refuses; start your dev server first (however you normally run it, or
`skitterspec spec-env dev up <spec>`). (Projects with no `dev` servers configured
have nothing to hot-reload — the switch still happens, with a warning.)

## 3. Take (or release)

```
skitterspec spec-env live take <spec>   # rebase → detach worktree → checkout in primary
skitterspec spec-env live status        # who's live (branch in the primary checkout + receipt)
```

The engine rebases the branch onto base, frees it from its worktree
(`switch --detach`), and checks it out in the primary checkout, then writes a
receipt (`.spec-env/live.json`). Relay its output. **If it reports the rebase hit
conflicts**, it left everything untouched — rebase the branch in its worktree,
resolve, then retry. **If it says a spec already holds the instance**, that spec
is live — release it first (below). If it warns dependencies changed, restart
your dev server after the switch.

Releasing (`/spec-live main`) lands in a later phase of this feature — until then,
finishing the spec via `/spec-complete` (which is live-aware) is the way to hand
the instance back.

## 4. Report

Echo which spec is now live on the primary checkout (and any warning), or — for
`status` — which branch the primary checkout is on and whether the instance is
free. Fixes you make while live commit straight onto the spec's branch.
