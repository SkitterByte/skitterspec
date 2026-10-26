---
github_identifier: "#34"
github_url: "https://github.com/SkitterByte/skitterspec/issues/34"
---

# Bug: port checks miss a server listening on every address (macOS)

> **Type:** Bug
> **Name:** bug-wildcard-port-probe
> **Status:** Complete (2026-10-26)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-26
> **Area:** `packages/common/src/env/proxy.js`, `packages/common/src/cli.js` (live take, connect)

## Symptom

In skitterload, `spec-env live take feat-plan-setup-flow` refused with
"no dev server listening on canonical port(s) 5173, 3300" while both were up
and answering 200 — Vite `host: true` on `*:5173`, Fastify on `*:3300`, for
phone-on-wifi dev.

Reproduced on macOS with a server on `0.0.0.0`, `::` and the Node default:
`portsInUse([port], '127.0.0.1')` returned `[]` for all three. The `connect`
half was confirmed too: a proxy bound `127.0.0.1:<port>` beside the wildcard
server, after which `localhost` reached the proxy and the LAN address
(`192.168.0.136`) still reached the old server.

## Root cause

`portsInUse` (`packages/common/src/env/proxy.js:95`) asks by **binding** a
probe on `config.proxy.host` (127.0.0.1). BSD lets a loopback bind coexist
with a wildcard listener, so on macOS the bind succeeds and the port reads as
free. Linux refuses the second bind, which is why CI never saw it. Two callers
used it for two different questions:

- `live take` (`cli.js`, canonical-port health gate) — "is a dev server
  running?" — read a running wildcard server as absent and refused.
- `connect` (`cli.js`, canonical-port refusal) — "may the proxy have these
  ports?" — read them as free and split `localhost` from the LAN.

The review server's `portsInUseOn` is **not** affected in practice: with
network on it probes `0.0.0.0`, which does conflict with a wildcard squatter
(verified: busy). With network off it binds loopback only, and loopback
connections then reach the review server, so its `local:` URL is right.

## Failing test (red)

`packages/common/test/env-proxy.test.js` — `portsAnswering sees a server
listening on every address` and `portsHeld reports a port a wildcard server
holds as busy`, each with a stays-silent partner on a free port (rule 3 in
`negative-checks.md`), plus a loopback-bound case for `portsHeld`. Written
against stubs that answered both questions with `portsInUse`, i.e. what the
callers asked before:

```
✖ portsAnswering sees a server listening on every address
    actual: [],  expected: [ 62544 ]
✖ portsHeld reports a port a wildcard server holds as busy
    actual: [],  expected: [ 62546 ]
```

Run: `node --test packages/common/test/env-proxy.test.js`

## Fix

- [x] Add `portsAnswering(ports, host)` — connects rather than binds; `live take` uses it
- [x] Add `portsHeld(ports, host)` — busy if the bind fails **or** something answers, bind then connect sequentially so the connect never finds the probe; `connect` uses it
- [x] Leave `portsInUseOn` (review server) unchanged — the repro shows it unaffected
- [x] Rebuild the dist copies (`pnpm build`) — `skitterspec`, `-linear`, `-github`, `-jira` are build outputs, gitignored
- [x] Failing tests pass (GREEN); full suite green on macOS, `env-proxy` green on Linux (`node:24-alpine`)

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env live take` — sees a dev server listening on every address |
| CLI command | update | `spec-env connect` — refuses canonical ports a wildcard server holds |
| Service | add | `proxy.js` `portsAnswering`, `portsHeld` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-26 | In Progress | in-progress | Reuben Greaves |
| 2026-10-26 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-26 — Bug reproduced on macOS for `live take` and `connect`; review server confirmed unaffected; failing tests added (red).
- 2026-10-26 — Fixed: split the bind probe into `portsAnswering` (connect) and `portsHeld` (bind + connect); tests green on macOS and Linux.
- 2026-10-26 — Completed; all tasks done, tests green.
