# Bug: the review-gate hook never installs, and crashes where it does

> **Type:** Bug
> **Name:** bug-review-gate-hook-install
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** `packages/common/src/init.js`, `packages/common/src/env/hooks.js`, `packages/common/assets/hooks/`

## Symptom

Two independent bugs, found upgrading a consumer project from
`@skitterbyte/skitterspec-linear@12.0.0` to `14.0.0`. Either one alone makes the
v14 review gate a no-op for an upgrading project.

**1 — `update` copies the hook but never registers it.** `MIGRATION.md` (v19→v20)
promises that `init` *and* `update` register `.claude/hooks/review-gate.js` as a
`PreToolUse` hook in the project's committed settings. `update` does not: it
routes to `resync()`, which never calls `registerReviewGateHook()`. The hook
*file* still lands (it is a managed target, so `resyncManagedFile()` copies it),
so the report reads `created: .claude/hooks/review-gate.js` and the upgrade looks
complete. Nothing is registered and nothing says so — `registerReviewGateHook()`
is the only code that would have reported it, and it never ran.

**2 — the hook is CommonJS shipped under a `.js` extension.** It is copied into
the *target* project, where that project's `package.json` decides how node parses
it. In a `"type": "module"` project it dies before its first line of logic.

## Reproduction

Both reproduced against this repo's HEAD (`node` driving `resync()` directly,
since the source package refuses `init`/`update` on uncomposed assets):

```
BUG 1 ------------------------------------------
hook file installed as: [ 'review-gate.js' ]
PreToolUse after update: undefined
=> registered? false

BUG 2 ------------------------------------------
ReferenceError: require is not defined in ES module scope, you can use import instead
This file is being treated as an ES module because it has a '.js' file extension
and '.../package.json' contains "type": "module".
exit=1
```

## Root cause

**1.** Copying the hook script and registering it are one operation split across
two functions: `installHooks()` (`packages/common/src/init.js:420`) does both but
is reachable only from `init()` and `reset()`, while `resyncManagedFile()`
(`:692`) copies the file on the `update` path and knows nothing about
registration. `resync()` (`:723`) never calls `registerReviewGateHook()` (`:398`).

**2.** `listHooks()` (`packages/common/src/init.js:45`) discovers `assets/hooks/*.js`
and `HOOK_SCRIPT` (`packages/common/src/env/hooks.js:21`) names
`.claude/hooks/review-gate.js`. The extension is the only thing that makes parse
mode independent of the host project's `package.json` — the one file skitterspec
does not control.

## Failing test (red)

Written in phase 1 and phase 2 respectively; see the phase files.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Hook asset | update | `assets/hooks/review-gate.js` → `review-gate.cjs` |
| Config key | update | `HOOK_SCRIPT` → `.claude/hooks/review-gate.cjs` (`HOOK_COMMAND`, `alreadyRegistered` follow) |
| Installer | update | `resync()` registers the hook; `ensureReviewGateHook()` gains a `migrated` outcome |
| Skill/rule | update | `spec-init` SKILL.md §4a, `rules/spec-planning.md`, root `MIGRATION.md` |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [`update` registers the hook](01-register-on-update.md) | ⬜ |
| 2 | [Ship the hook as `.cjs`, migrate stale registrations](02-cjs-extension.md) | ⬜ |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-15 — Both bugs reproduced against HEAD; spec captured.
