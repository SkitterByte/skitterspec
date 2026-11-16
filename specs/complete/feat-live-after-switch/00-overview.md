---
github_identifier: "#207"
github_url: "https://github.com/SkitterByte/skitterspec/issues/207"
---

# Run conditional commands when a spec goes live

> **Type:** Feature
> **Name:** feat-live-after-switch (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/207
> **Author:** Reuben Greaves
> **Raised:** 2026-11-16
> **Area:** packages/common/src/env/{config,live,integrate}.js, packages/common/src/cli.js, packages/common/assets/core/env.config.md, packages/common/assets/rules/spec-planning.md, docs/reference.html
> **Stack:** worktree
> **Docs:** reference

## Summary

`/spec-live` (and the review page's `▶ Put it live`) can now run the project's
own commands — an install, a codegen — in the primary checkout when a spec goes
live and again when it is handed back, each only when the switch changed the
files it names. It uses the same `{ run, when }` grammar `afterLand` already has.

## Problem

`afterLand` catches the primary checkout up after a land: `pnpm install` when
the lockfile moved, `db:generate` when the schema did. `live take` does the same
kind of switch — it checks a branch out in the primary checkout under the
running dev server — and `live release` switches it back, but both only print
`dependencies changed on this branch — restart your dev server`. The generated
client and `node_modules` stay built for the other tree, so the live spec fails
in exactly the way `feat-conditional-after-land` recorded (500s from a stale
Prisma client), and so does `main` after release. The operator has to notice,
work out which command, and run it by hand — every time.

## Acceptance criteria

- With `live.afterSwitch` set, `/spec-live <spec>` runs each matching command in
  the primary checkout after the checkout, and prints which ran, which were
  skipped and why.
- `/spec-live main` runs the same list, against the same changed files, after
  switching back to the base branch.
- A failing command stops the list, is reported with its exit status and the
  tail of its output, and leaves the switch in place.
- With `live.afterSwitch` unset, `live take` and `live release` print exactly
  what they print today.
- The page's `▶ Put it live` gets the same behaviour with nothing added to
  `/spec-diff`, because it runs `live take` too.

## Decisions

1. **A new key, `live.afterSwitch`, not `afterLand`.** `afterLand` holds things
   like `pnpm db:data-migration`, which must never run for a branch that has not
   landed — and live take already refuses a branch that touches migrations.
   Rejected: reusing `afterLand`, or reusing only its conditional entries (no
   new key, but an implicit rule nobody would guess).
2. **The same grammar as `afterLand`**: a plain string always runs,
   `{ run, when }` runs when the switch changed a matching file,
   `{ setup: true }` expands to every `setup` entry that declares `when`. Same
   normaliser, same `decide()`; the planner helper in `integrate.js` is lifted
   to be shared rather than copied.
3. **Run on take and on release, against one file set.** Release reverts the
   same files take brought in, so `main` needs the same catch-up. The range is
   `onto...branch` — on take read before the rebase (the read that already
   feeds `migrationsHit`/`depsChanged`), on release `base...branch` read before
   the checkout. Rejected: take only (leaves `main` stale until someone
   notices); abort as well (crash recovery should not gain a new way to fail —
   abort prints nothing new).
4. **The engine runs them, not a caller.** `live take` already executes its own
   git steps, `/spec-live` is a pre-executed command told to run nothing else,
   and the page's action has no caller turn at all. This is the deliberate
   difference from `afterLand`, where the engine only plans.
5. **Stop at the first failure, never undo the switch.** A failure is a `!`
   warning with the command, its exit status and the last 20 lines of its
   output, then the commands not run. Rolling the branch back over a failed
   install would hide the cause and swap one broken tree for another.
6. **Output is captured, not streamed.** The slash command relays engine output
   verbatim, and a full `pnpm install` log would bury the result. Success prints
   one line per command; only a failure prints output.
7. **Cannot tell → the conditional entries run**, as `afterLand` decides it: a
   diff git would not answer is an unknown range, and a redundant install costs
   seconds where a skipped one leaves the tree broken with nothing pointing at
   why. A known empty range skips them.
8. **Unset means nothing runs.** Opt-in, like `afterLand`; the existing
   `dependencies changed` warning and restart reminders are unchanged either
   way — an install is not a server restart. Rejected: defaulting to
   `{ setup: true }`, which would change behaviour for every project on upgrade.
9. **Literal strings, no token expansion** — the commands run in the primary
   checkout, where a spec's `{slug}` or `{portOffset}` mean nothing, exactly as
   `afterLand` reasons.

## Solution overview

```jsonc
"setup": [
  { "run": "pnpm install --frozen-lockfile", "when": ["pnpm-lock.yaml", "**/package.json"] },
  { "run": "pnpm run db:generate", "when": ["prisma/schema.prisma"] }
],
"live": {
  "migrations": ["prisma/migrations/**"],
  "afterSwitch": [{ "setup": true }]
}
```

A take whose branch changed the schema prints:

```
spec-env live take: feat-x is live on the primary checkout

  primary:   now on feat/x (was main @ 4a1c9e2)
  worktree:  ../repo-wt/x (detached — branch handed to the primary checkout)
  after switch (in /repo):
    ran:  pnpm run db:generate   # prisma/schema.prisma changed
  skipped (nothing in the switch matched):
    pnpm install --frozen-lockfile   # when pnpm-lock.yaml, **/package.json

  Test at your canonical URL; release with: /spec-live main
```

`planTake` and `planRelease` gain an `afterSwitch` field shaped like a plan's
`afterLand` (`{ cwd, commands, entries, range }`), so the CLI runs
`afterSwitch.commands` and prints from `entries`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `live.afterSwitch[]`: string \| `{ run, when }` \| `{ setup: true }` |
| Domain object | update | `planTake` / `planRelease` result: + `afterSwitch` |
| CLI command | update | `spec-env live take`, `spec-env live release`: run and report after-switch commands |
| Service | update | `afterLandFor` / `decide` lifted to a shared helper |
| Docs | update | `env.config.md` (`live.afterSwitch`), `reference.html`, `spec-planning.md` live paragraph |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config and planner: `live.afterSwitch` decided per switch | ✅ | [01-config-and-planner.md](01-config-and-planner.md) |
| 2 | Run and report on take and release; docs | ✅ | [02-run-and-report.md](02-run-and-report.md) |

## Open questions

- None

## Changelog

- 2026-11-16 — Spec created.
- 2026-11-16 — Phase 1: the shared decider lives in a new
  `src/env/triggered.js` (`planTriggered`); `afterLandFor` is now a thin
  caller. Planners take the range as ctx `changedFiles`, as integrate does.
- 2026-11-16 — Completed; all phases done, tests green.
