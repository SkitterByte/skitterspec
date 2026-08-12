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
`/spec-connect` for them. It also **always refuses a `Type: Hotfix` spec** — its
branch is built on an old release tag, so hot-reloading it onto the running dev
server could break the shared instance; test a hotfix with `/spec-connect`. The
engine enforces all of this and prints why.

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
skitterspec spec-env live release        # hand the instance back to base, re-isolate the branch
skitterspec spec-env live abort          # crash recovery (see below)
skitterspec spec-env live status         # who's live (branch in the primary checkout + receipt)
```

**Take** rebases the branch onto base, frees it from its worktree
(`switch --detach`), checks it out in the primary checkout, then writes a receipt
(`.spec-env/live.json`). Relay its output. **If it reports the rebase hit
conflicts**, it left everything untouched — rebase the branch in its worktree,
resolve, then retry. **If it says a spec already holds the instance**, release it
first. If it warns dependencies changed, restart your dev server after the switch.

**Release** (`/spec-live main`) is the graceful exit of an unfinished session:
`skitterspec spec-env live release` reads the live spec from the receipt, checks
base back out in the primary checkout, re-attaches the branch to its worktree, and
clears the receipt. Commit any fixes to the branch first — it refuses on a dirty
tree rather than discard them. (To *finish* a live spec instead of releasing it,
use `/spec-complete`, which is live-aware.)

**Abort** is crash recovery, for when a session died mid-take and left the primary
checkout on a feature branch: `skitterspec spec-env live abort` restores base from
the receipt and re-isolates. It refuses if the primary checkout has uncommitted
changes (it won't discard them) — commit or stash first.

## 4. Report

Echo which spec is now live on the primary checkout (and any warning), that it was
released / recovered, or — for `status` — which branch the primary checkout is on
and whether the instance is free. Fixes you make while live commit straight onto
the spec's branch.
