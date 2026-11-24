---
github_identifier: "#305"
github_url: "https://github.com/SkitterByte/skitterspec/issues/305"
---

# Bug: `spec-env dev up --plan` starts the dev servers

> **Type:** Bug
> **Name:** bug-dev-up-plan-starts-servers (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/305
> **Area:** packages/common (src/cli.js `specEnvDev`)
> **Docs:** reference

## Symptom

Reported by the operator: `skitterspec spec-env dev up --plan` starts the
spec's dev servers instead of only printing the plan. Elsewhere `--plan` means
"describe, run nothing" (`up`, `bootstrap`, `hotfix land`). The same applied to
`dev down --plan`, which stopped running servers.

## Root cause

`specEnvDev` (`packages/common/src/cli.js:7122`) took no `flags` argument, and
its call site passed none, so `--plan` was parsed and then dropped. `dev up`
went on to reserve a slot (`writeRegistry`) and `startProcess` every configured
server. `dev down` called `stopProcess` on each.

## Failing test (red)

`packages/common/test/cli-spec-env-dev.test.js`: "dev up --plan describes the
servers and starts none", "dev down --plan leaves a running server running",
and "STAYS SILENT: dev up --plan on a running server says so and starts
nothing more". Run `node --test packages/common/test/cli-spec-env-dev.test.js`.
Red:

```
✖ dev up --plan describes the servers and starts none
✖ dev down --plan leaves a running server running
✖ STAYS SILENT: dev up --plan on a running server says so and starts nothing more
ℹ pass 0  ℹ fail 3   (--test-name-pattern="plan")
```

## Fix

- [x] Pass `flags` to `specEnvDev`. Under `--plan`, write no slot and print
      each server as `would start` / `already running (pid N)` on up, or
      `would stop pid N` / `not running` on down.
- [x] Note `--plan` in the usage text and in `docs/reference.html`. Stamp
      `reference` and `index`.
- [x] Failing tests pass (GREEN); `pnpm build` and `pnpm test` green.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env dev up\|down --plan` describes and touches nothing |

## Changelog

- 2026-11-24 — Bug reproduced; failing tests added (red).
- 2026-11-24 — Fixed: `dev` honours `--plan` on up and down; suite green
  (5514 pass).
- 2026-11-24 — Completed; fix done, tests green.
