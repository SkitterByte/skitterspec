---
github_issue_id: "#178"
---

# Phase 1 — Engine: member links + loopback tier ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `epic status` member links and every tier stack point a phone reader
at something it can open — proven by tests over both binds.

## Tasks

- [x] In `epic status` (`packages/common/src/cli.js`, `linkFor`), build the
      member link from `reviewServedUrls(...).url` — the network URL on a wide
      bind, loopback on a narrow one
- [x] In `reviewTierStack` (`packages/common/src/env/review.js`), report a
      loopback-bound server's `network` tier as `off` with `served.widen` as
      its `enable`, ahead of the no-address fallback
- [x] Drop the review render's separate "loopback-bound — widen" line now the
      tier carries it; keep `--json` `tiers` the source of truth
- [x] Tests: wide bind → member link on the network host; loopback bind →
      `127.0.0.1` link and `network: off — …--host 0.0.0.0`; no addresses on a
      wide bind → still `no network address on this machine` (stays-silent)
- [x] Run `pnpm test` — green before the phase is done

## Notes

A loopback-bound `network` tier carries `bound: "loopback"`, and `tierAction`
returns nothing for it: the page's `allow-network` press would write a config
key that is already true, and widening restarts the server (new token, dead
links), so the command is named rather than pressed.
