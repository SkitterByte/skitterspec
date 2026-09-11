---
linear_identifier: "SKS-154"
linear_url: "https://linear.app/skitterbyte/issue/SKS-154/a-planner-for-connect-and-tests-for-what-it-decides"
---

# A planner for connect, and tests for what it decides

> **Type:** Feature
> **Name:** feat-connect-planner (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-11
> **Area:** packages/common/src/env/connect.js (new), packages/common/src/cli.js, packages/common/test/env-connect.test.js (new), packages/common/test/cli-spec-env-connect.test.js (new)
> **Stack:** worktree

## Problem

`spec-env connect` is the only verb in the family with no pure planner. Every
sibling splits the decision from the side effect — `planUp`, `planDev`,
`planTake`, `planIntegrate`, `planRelease`, `planAbort` — and is unit-tested
through it. `specEnvConnect` decides inline, so its three refusals and its
ordering are reachable only by driving the CLI against a git fixture, and today
nothing does.

The components underneath are covered well: `planDev` has six tests,
`renderRoutes` / `startProxy` / `waitListening` / `portsInUse` have seven
including a real WebSocket upgrade, and `startProcess` / `stopProcess` have five.
What is untested is **this function's own judgement** — which branch it takes and
in what order — plus the two files it writes, `.spec-env/proxy.json` and
`.spec-env/connected`.

That second file is a **cross-skill contract**: `/spec-complete`'s teardown reads
`.spec-env/connected` to decide whether to disconnect before removing a worktree.
Nothing asserts it is written, and nothing asserts `connect main` removes it.

## Decisions

1. **Extract `planConnect` into a new `packages/common/src/env/connect.js`.**
   One module per verb is the established shape (`dev.js`, `live.js`,
   `integrate.js`, `teardown.js`, …). *Rejected:* `proxy.js` — that file is
   spawned as a child process (`node proxy.js <routes>`), so planner logic would
   ship inside the running proxy for no reason.
2. **The planner is pure; the CLI probes.** `portsInUse` is async and touches the
   network, so the busy-port list cannot be computed inside a pure function. The
   CLI gathers the facts — the registry slot, the rendered routes, the busy
   ports — and hands them to `planConnect`, exactly as `specEnvLiveTake` gathers
   git state for `planTake`.
3. **Every refusal keeps its current wording.** These strings are what an
   operator reads, two of them name the fix, and one is quoted in
   `docs/index.html`. The refactor changes structure, not output — and the tests
   written in phase 1 are what prove it.
4. **Scope stops at the branches and the state files.** No test spawns a proxy
   through the CLI. `env-proxy.test.js` already starts a real proxy and forwards
   HTTP, a 502 and a WebSocket upgrade through it; repeating that through the CLI
   buys coverage of `startProcess`, which `env-supervise.test.js` already has, at
   the cost of the most flake-prone test in the suite.
5. **`connect main` is tested for what it deletes, not just what it prints.**
   The existing zero-arg tests assert the message. The contract `/spec-complete`
   depends on is the *absence of the files* afterwards.

## Solution overview

```
specEnvConnect (cli.js)                  connect.js
  resolve spec ─────────────────┐
  read registry slot ───────────┤
  planDev + renderRoutes ───────┼──────► planConnect(spec, config, ctx)
  await portsInUse(frontPorts) ─┘          → { blocked: true, reason }
                                           → { blocked: false, routes,
                                               routesFile, connectedFile }
  execute: stop old proxy, write routes,
           start proxy, write connected
```

Three blocked reasons, all unchanged in wording: no reserved ports yet · no dev
process declares a frontPort · canonical port(s) in use.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Module | add | `src/env/connect.js` — `planConnect` |
| CLI | update | `specEnvConnect` probes, then executes a plan |
| Test | add | `test/env-connect.test.js` — the planner's branches |
| Test | add | `test/cli-spec-env-connect.test.js` — the state files |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Extract `planConnect`, and test what it decides | ⬜ | [01-plan-connect.md](01-plan-connect.md) |
| 2 | Pin the state files `/spec-complete` depends on | ⬜ | [02-state-files.md](02-state-files.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-11 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-11 — Spec created, out of a `confirm` raised while reviewing
  `feat-bare-argument-parity` phase 2: a test named "connects the sole
  provisioned spec" in fact asserted only resolution, because `specEnvConnect`
  returns early on the registry-slot check. Renaming it (`9461316`) fixed the
  claim and exposed the real gap, which is this spec. The first framing of that
  gap — "nothing exercises planDev/renderRoutes/startProcess" — was wrong and is
  recorded here so it is not repeated: those are all covered on their own. The
  untested thing is the orchestration around them.
