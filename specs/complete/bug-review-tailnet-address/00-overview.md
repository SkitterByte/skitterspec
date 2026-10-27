---
github_identifier: "#45"
github_url: "https://github.com/SkitterByte/skitterspec/issues/45"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Bug: review page never offers a Tailscale address

> **Type:** Bug
> **Name:** bug-review-tailnet-address
> **Status:** Complete (2026-10-27)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-27
> **Area:** packages/common/src/cli.js (review address ranking)

## Symptom

Away from home wifi, a phone on the same tailnet as the laptop can reach the
served review page — but `spec-env review` never prints that address. The
`network` tier offers only the LAN IP (unreachable off-network) and no `also:`
line carries the tailnet one, so the reader has no link that works.

## Root cause

`offerableLanAddresses` (`packages/common/src/cli.js:4574`) drops every
address on an interface matching `VIRTUAL_IFACE`, which includes `utun`. On
macOS Tailscale's `100.64.0.0/10` address lives on `utunN`, so it is filtered
out with the VPN and Parallels adapters the filter exists to hide.

## Failing test (red)

`packages/common/test/env-review-tiers.test.js` —
`a tailnet address on a utun adapter is offered, after the LAN` and
`a tailnet alternate is labelled so it reads apart from the LAN one`.
Run: `node --test packages/common/test/env-review-tiers.test.js`.

```
actual: [ '192.168.0.10' ],
expected: [ '192.168.0.10', '100.101.7.42' ],
TypeError: tailnetLabel is not a function
```

## Fix

- [x] Keep a virtual-interface address when it is in `100.64.0.0/10`, ranked
      after physical addresses so the LAN stays the best guess on wifi
- [x] Label a tailnet `also:` line `(tailnet)` in the text output
- [x] Failing tests pass (GREEN); typecheck + full suite, no regressions
- [x] None further

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review` — `also:` may list a tailnet URL, labelled `(tailnet)` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-27 | In Progress | in-progress | Reuben Greaves |
| 2026-10-27 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-27 — Bug reproduced; failing test added (red).
- 2026-10-27 — Fixed: keep 100.64.0.0/10 on virtual adapters, after the LAN, labelled `(tailnet)`; test green (4174 pass)
- 2026-10-27 — Completed; all phases done, tests green.
