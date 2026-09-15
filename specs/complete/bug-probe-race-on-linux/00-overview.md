---
linear_identifier: "SKS-267"
linear_url: "https://linear.app/skitterbyte/issue/SKS-267/bug-the-review-server-never-starts-on-linux"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the review server never starts on Linux

> **Type:** Bug
> **Name:** bug-probe-race-on-linux (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-15)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** packages/common/src/env/proxy.js, packages/common/src/cli.js, packages/common/test/env-serve-start-proof.test.js

## Symptom

On Linux the review server never starts. `spec-env review` falls back to a
`file://` URL and a `serve:` hint even for a reader it has just identified as
remote — the exact dead link the feature exists to stop printing:

```
  reader: remote (configured)
  open: file:///tmp/.../feat-alpha.html   (will not open where you are reading)
  serve: skitterspec spec-env review serve --host 0.0.0.0
```

Five tests fail on CI and all five pass on macOS:

```
✖ a remote reader is given a link that opens where they are
✖ a second review adopts the running server rather than restarting it
✖ the alternates are real alternatives to the offered link
✖ a loopback probe cannot see a wildcard squatter
✖ stays silent: a free port still starts and is still reported
```

## Root cause

**One assumption, in two places.** The pre-flight at
`packages/common/src/cli.js:2454` asked whether the port was free on both the
address the daemon will bind and on loopback, and asked them **concurrently**:

```js
const probes = [...new Set([host, '127.0.0.1'])]
const busy = (await Promise.all(probes.map((h) => portsInUse([usePort], h)))).flat()
```

`portsInUse` answers by **binding**, so two probes of one port contend with each
other. Under BSD that contention is invisible — a wildcard bind and a loopback
bind of one port coexist — which is why this shipped and why every macOS run is
green. **Linux makes the two mutually exclusive**, so the pair races itself: one
probe takes `0.0.0.0:P`, the other is refused `127.0.0.1:P`, and a completely
free port is reported busy. `startServe` returns `error: 'busy'`, no server
starts, and the four review/serve tests follow from that one refusal.

The fifth failure is the same assumption written into a test:
`a loopback probe cannot see a wildcard squatter` asserted that a loopback probe
returns `[]` while a wildcard squatter holds the port. True on BSD, false on
Linux.

## Failing test (red)

`packages/common/test/env-serve-start-proof.test.js` —
**`the two address probes never overlap`**. It feeds an instrumented probe to
the extracted helper and asserts peak concurrency is 1. Run with
`node --test packages/common/test/env-serve-start-proof.test.js`.

Asserting on the **overlap** rather than the verdict is what makes it reproduce
on a Mac — a test asking merely "is a free port free?" passes here however the
probing is ordered, which is exactly how the defect reached CI. Against the old
parallel form it fails on macOS:

```
✖ the two address probes never overlap
  AssertionError: probes of one port must not contend with each other
ℹ pass 9   ℹ fail 1
```

## Fix

- [x] Extract `portsInUseOn(port, hosts, probe)` in
      `packages/common/src/env/proxy.js`, which asks one host at a time and
      dedups; `probe` is injectable so the concurrency is assertable without
      sockets.
- [x] Point the `cli.js` pre-flight at it, and record in the comment that the
      BSD coexistence it relied on is the thing Linux does not do.
- [x] Make the BSD-semantics test assert its premise per-platform, keeping the
      universal claim — probing the address it will actually bind sees the
      conflict — asserted for both.
- [x] Extend the source guard: the pre-flight must not reintroduce
      `Promise.all(probes.map(...))`.
- [x] Failing test now passes (GREEN); full suite green, no regressions.

## Verification on the platform that had the bug

Both platforms, against the shipped helper (`node:24-alpine` for Linux):

| case | macOS | Linux |
|------|-------|-------|
| free port | starts | **starts** (was: refused) |
| wildcard squatter | refuses | refuses |
| loopback squatter | refuses | refuses |
| old parallel form, free port | `[]` | `[41341]` — the bug |

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review` / `review serve` — starts on Linux |
| Domain object | add | `portsInUseOn` in `env/proxy.js` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |
| 2026-09-15 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-15 — Bug reproduced; failing test added (red).
- 2026-09-15 — Fixed: the pre-flight probes one address at a time; test green.
- 2026-09-15 — Second platform bug found by the same CI run as
  `bug-up-accuses-its-own-write`. Both were invisible because the suite had only
  ever run on macOS; a Linux job would have caught both long before CI existed.
- 2026-09-15 — Completed; fix in, tests green (2396).
