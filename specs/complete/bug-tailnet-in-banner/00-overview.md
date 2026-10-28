---
github_identifier: "#53"
github_url: "https://github.com/SkitterByte/skitterspec/issues/53"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Bug: the tailnet `also:` link never reaches the review banner

> **Type:** Bug
> **Name:** bug-tailnet-in-banner
> **Status:** Complete (2026-10-28)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-28
> **Area:** packages/common/src/env/review.js, packages/common/src/cli.js, assets/rules/spec-reports.md, four SKILL.md files

## Symptom

Reported from ereqs (running `@skitterbyte/skitterspec-azure-boards` 1.2.1):
"I don't get the tailnet option on reviews." The engine finds the Tailscale
address — `offerableLanAddresses()` on that machine returns
`['192.168.0.136', '100.126.111.34']` — but the review banner a `/spec-next`,
`/spec-bug` or `/spec-hotfix` run ends with shows only the LAN URL. A reader
off the home wifi has no clickable link, even though one exists. Verdicts are
never lost; the link is.

## Root cause

Three pieces, one hole between them:

- The engine offers the tailnet address and prints it —
  `offerableLanAddresses()` keeps 100.64.0.0/10 on `utun*`
  (`packages/common/src/cli.js:4574`), and the text render emits
  `    also:  <url> (tailnet)` lines (`cli.js:4272`).
- The skills say to relay those lines ("pass them on rather than editing them
  out" — spec-next/spec-bug/spec-hotfix SKILL.md).
- But `assets/rules/spec-reports.md` defines the ⏸ banner as exactly three
  tier bullets (local · network · remote) and the `Review` row as "the same
  tiers the banner lists", with no place for an alternate — and it warns that
  the stack is "copied rather than composed". The model follows the stricter
  contract and drops the line.

Two engine wrinkles feed the hole:

- `cli.js:4271` appends the `also:` lines **after the whole stack** — below
  `remote:` — while its own comment (and
  `env-review-reader.test.js:558`) says they sit under `network`.
- `reviewTierStack` (`packages/common/src/env/review.js:718`) carries
  `alternates` as bare URL strings, so a skill copying the stack from `--json`
  has no `(tailnet)` label to copy; the label exists only in the text render
  (`tailnetLabel`, `cli.js:4598`).

## Failing test (red)

`packages/common/test/env-review-tiers.test.js` —
run `node --test packages/common/test/env-review-tiers.test.js`:

- `a tailnet alternate reaches the tiers labelled, under network` — asserts
  `tiers[network].alternates` deep-equals
  `[{ url: 'http://100.101.7.42:7760/tok/bug-x', label: 'tailnet' }]`;
  red: the actual array holds the bare string.
- `the also: line renders under the network tier, inside its line` — asserts
  `reviewTierLine` carries the indented `also:` line; red: the line ends at
  the URL.
- `STAYS SILENT: a LAN alternate carries no label, and no alternates means one
  line` — red on the first half for the same reason.

```
✖ a tailnet alternate reaches the tiers labelled, under network
  + 'http://100.101.7.42:7760/tok/bug-x'
  - { url: 'http://100.101.7.42:7760/tok/bug-x', label: 'tailnet' }
```

## Fix

- [x] `reviewTierStack` labels the network tier's alternates:
      `{ url, label: 'tailnet' }` objects (label absent when it is not one),
      moving `isTailnetAddress`/`tailnetLabel` into `review.js` with `cli.js`
      re-exporting them, so `--json`'s `tiers` is self-sufficient.
- [x] `reviewTierLine` renders the network tier's `also:` lines as part of
      that tier's line, and `cli.js` drops its separate after-the-stack
      append — placement under `network` becomes true by construction.
- [x] `assets/rules/spec-reports.md`: the banner's `network` bullet may carry
      indented `also —` sub-bullets copied verbatim (labelled); the `Review`
      row carries them inline after the network URL; the worked banner shows
      one; "Three tiers" states an alternate is part of the network tier, not
      a fourth; the "two doors into one room" paragraph names them (same
      server, same pending store, so the wait-coverage line stays true).
- [x] spec-next / spec-bug / spec-hotfix SKILL.md wording matches the amended
      contract (spec-diff's table row already did).
- [x] Failing tests now pass (GREEN); `node --test` at the repo root: 4210
      pass, 0 fail (dists re-synced via `scripts/build-dist.js all`).
- [x] Follow-up hardening: deferred to its own spec, recorded in the
      Changelog — the review-gate/main-guard hooks read engine exit
      status 1 as a refusal, so an engine that *crashes* (exit 1, reason on
      stderr) denies every tool call with an empty reason — including the
      edit that would fix the crash. Needs a positive refusal signal; its own
      spec, surfaced while fixing this one.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI output | update | `spec-env review`: `also:` lines move under `network:` (above `remote:`) |
| JSON shape | update | `tiers[network].alternates`: `string[]` → `{ url, label? }[]` |
| Skill/rule | update | `spec-reports.md` banner + `Review` row admit labelled alternates under `network` |
| Skill/rule | update | spec-next · spec-diff · spec-bug · spec-hotfix SKILL.md wording aligned |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-28 | In Progress | in-progress | Reuben Greaves |
| 2026-10-28 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-28 — Bug reproduced; failing tests added (red).
- 2026-10-28 — Fixed: alternates labelled in `tiers`, rendered inside the
  network tier line, and given a place in the banner/`Review`-row contract;
  tests green (4210 pass).
- 2026-10-28 — Handoff corrected: `tiers` already carried `alternates`
  (unlabelled) since 1.2.1; the missing halves were the label in `--json`,
  the placement (printed below `remote:`), and the contract's silence.
- 2026-10-28 — Follow-up surfaced: the gate hooks deny on engine exit 1, so a
  crashed engine (exit 1, stderr-only) bricks every tool call with an empty
  reason and blocks its own fix; wants a positive refusal signal. Not in
  scope here.
- 2026-10-28 — Completed; fix committed on the verdict (25de280c), tests
  green (4210). Hook-hardening follow-up deliberately deferred to its own
  spec.
