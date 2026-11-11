---
github_identifier: "#177"
github_url: "https://github.com/SkitterByte/skitterspec/issues/177"
---

# Epic links reach a phone reader

> **Type:** Feature
> **Name:** feat-epic-links-reach-phone
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/177
> **Author:** Reuben Greaves
> **Raised:** 2026-11-11
> **Area:** packages/common/assets/rules/spec-reports.md, packages/common/src/cli.js, packages/common/src/env/review.js, packages/common/src/env/nextaction.js
> **Stack:** worktree
> **Docs:** reference, review

## Summary

Every link `epic status` prints opens on a phone: agents relay the epic page's
full set of links rather than one, a member waiting on a verdict links to the
network address, and a server bound to localhost only says which command opens
it up.

## Problem

Asked about an epic, an agent replied with the member list and a single URL —
the local one — and none of the network or tailnet links the engine printed.
That is the reader's to see, so the summarising agent cut the only links a
phone could open. Two engine gaps make the same failure possible with no agent
involved: a member row waiting on a verdict links to `127.0.0.1` even when the
server is bound to the network, and a localhost-only server's `network:` line
reads `no network address on this machine` when the machine has addresses and
the fix is one command.

## Acceptance criteria

- Asked about an epic outside any skill, an agent relays the epic page's
  `local`, `network` (with its `also:` alternates and labels) and `remote`
  lines whole.
- With the review server bound wide, a waiting member row in `epic status`
  reads `verdict → http://<network address>:…/<spec>`.
- With the server bound to localhost, that row keeps the `127.0.0.1` link.
- With the server bound to localhost, every tier stack — review render and epic
  page — reads `network: off — turn on with: skitterspec spec-env review serve
  --host 0.0.0.0`.
- A machine with genuinely no network address still reads `no network address
  on this machine`.

## Decisions

1. **A relay rule, everywhere, in `spec-reports.md`.** The stack is already
   "the engine's, copied rather than composed" — but stated for a skill's
   block. One sentence widens it to any relay, in or out of a skill (an
   ad-hoc `epic status`, `resolve`, a question). Rejected: a hint line in the
   engine's output — text aimed at a model, and the rule already exists.
2. **Member links use the network URL when the server is bound wide**, else
   local. It opens on the machine and on a phone on the wifi, and keeps the
   row to one link. A tailnet reader uses the epic page, whose member links
   are already relative. Rejected: every tier per row — the table becomes
   unreadable; path only — not openable from the terminal.
3. **A localhost bind is `off` with the widen command**, in the shared
   `reviewTierStack`, so every caller gets it. The command restarts nothing by
   itself — it is named, never run, and the person typing it knows it mints a
   new link.

## Solution overview

`epic status` builds its member `linkFor` from `reviewServedUrls(up, addrs,
spec).url` instead of a hard-coded `127.0.0.1`. `reviewTierStack` gains a
branch for `served.loopback && served.widen` ahead of the no-address fallback,
pushing `{ tier: 'network', off: true, enable: served.widen }`. The review
render's separate "loopback-bound — widen" line then duplicates the tier and is
dropped. `spec-reports.md` gets one sentence under *The stack is the engine's*.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `epic status` member `verdict →` link host |
| CLI command | update | `network:` tier on a loopback bind (review render, epic page, re-show) |
| Skill/rule | update | `spec-reports.md` — relay a tier stack whole, in or out of a skill |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine: member links + loopback tier | ✅ | [01-engine-links.md](01-engine-links.md) |
| 2 | Relay rule + docs | ⬜ | [02-relay-rule-docs.md](02-relay-rule-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-11 — Spec created.
- 2026-11-11 — A loopback-bound network tier offers no page press (`bound:
  "loopback"`): `allow-network` would change nothing, and widening restarts
  the server.
