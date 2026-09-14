---
linear_identifier: "SKS-226"
linear_url: "https://linear.app/skitterbyte/issue/SKS-226/bug-the-review-server-reports-it-started-when-it-did-not"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the review server reports it started when it did not

> **Type:** Bug
> **Name:** bug-server-start-not-proven (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-14)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/src/cli.js, packages/common/test/env-review-reader.test.js

## Symptom

Every `spec-env review` minted a fresh URL token and reported a server started,
while no server was running at all. Three renders in a row produced three
different URLs; `spec-env review serve --status` said `not running`; the log held
`listen EADDRINUSE: address already in use 0.0.0.0:7777` once per render.

The page the operator was handed was served by **someone else's process** — a
daemon leaked by a test hours earlier, whose temp directory had long since been
deleted. It answered on the port and failed on every page.

Found by an operator asking whether two specs in parallel would fight over the
server. The answer to *that* was no; the flapping they were seeing was this.

## Root cause

**Three defects, and the first two are why the third was invisible.**

1. **`packages/common/src/cli.js` — the pre-flight asked about the wrong
   address.** `portsInUse([usePort], loopback ? host : '127.0.0.1')` substitutes
   loopback whenever the bind is not loopback. Under BSD semantics a loopback
   bind and a wildcard bind **coexist**, so binding `127.0.0.1:7777` succeeds
   while something holds `0.0.0.0:7777` — the probe answered "free" about a port
   that was taken for the bind that mattered.

2. **`packages/common/src/cli.js` — the confirmation proved the wrong thing.**
   `waitListening` **connects**, and a squatter satisfies a connect. So a daemon
   that died on `EADDRINUSE` milliseconds earlier was reported `started: true`,
   because *something* was answering. A positive signal that is not specific
   enough to be evidence — `.claude/rules/negative-checks.md` inverted.

3. **`packages/common/test/env-review-reader.test.js` — a test leaked the
   daemon.** `cleanup()` deleted the temp dir but never stopped the server, and
   two tests scaffolded a serving reader without naming a port, so they took
   `review.servePort` — the operator's real 7777 — and left it running after the
   suite exited.

Either check, asked correctly, would have caught the leak the day it started.

## Failing test (red)

`packages/common/test/env-serve-start-proof.test.js` —
*"a render whose port is already held does not claim a server"*. It holds the
port on `0.0.0.0`, renders, and asserts `--json` reports no server.

Run: `pnpm exec node --test packages/common/test/env-serve-start-proof.test.js`

```
✖ a render whose port is already held does not claim a server
  AssertionError: no server was claimed
  + actual - expected
  + { alternates: [ 'http://10.211.55.2:52683/01d4647de17d/feat-alpha', …
```

## Fix

- [x] Probe **both** the bind host and loopback, deduped. Neither sees the
      other, and a port half-taken is unusable — a wildcard bind while loopback
      is held would leave the `local:` URL this CLI prints dead.
- [x] Require the spawned process to still be alive before calling the start
      good, and distinguish `died` from `silent`.
- [x] Stop the server in the reader suite's `cleanup()` — structurally, not per
      test. Six of eight serving tests remembered; the two that did not leaked.
- [x] Give the two default-port tests a free port, so a test never binds the
      port the operator uses.
- [x] Failing test now passes (GREEN); `pnpm test` green at the root and in
      `packages/common` — no regressions.
- [x] None.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI | update | `ensureReviewServer` — port probe, start proof, `died` error |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |
| 2026-09-14 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-14 — Completed; fix in, tests green (2241).
- 2026-09-14 — Fixed: probe both addresses, prove the start by our own process,
  and stop servers in the suite's cleanup; tests green (2241).
- 2026-09-14 — The first fix was **wrong and the existing suite caught it**.
  Probing only the bind host turned an existing test red — *"a port already in
  use falls back to the file link"*, which holds loopback and expects a refusal.
  Under the narrow fix a wildcard bind would have succeeded there, leaving a
  server answering on the LAN and dead on `localhost`. Probing both is the
  answer, and the test that objected is the reason it was found.
- 2026-09-14 — Two guards had to be **re-pinned from spellings to properties**:
  one of mine matched `portsInUse([usePort], host)` verbatim, and one from
  `feat-review-serve-version` matched two error-return lines verbatim. Both went
  red against correct code. A guard that names an exact line is a guard that
  fires on the next legitimate edit — pinned to what must be true instead.
- 2026-09-14 — Bug reproduced; failing test added (red).
