---
github_identifier: "#250"
github_url: "https://github.com/SkitterByte/skitterspec/issues/250"
---

# The tailnet is remote — retire the published page

> **Type:** Feature
> **Name:** feat-tailnet-remote-tier (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/250
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** packages/common/src/env/review.js, packages/common/src/env/serve.js, packages/common/src/env/config.js, packages/common/src/env/epicpage.js, packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/rules/spec-reports.md, packages/common/assets/rules/spec-planning.md, packages/common/assets/skills/, packages/common/assets/commands/spec-remote-review.md, packages/common/assets/core/, packages/common/assets/claude-md-section.md, CLAUDE.md, MIGRATION.md, docs/, packages/common/test/
> **Stack:** worktree
> **Docs:** review, index, reference, linear, jira, azure-boards

## Summary

The review banner names each door by what it is: `local` is this machine,
`network` is the LAN and `remote` is the tailnet address, each on its own line.
Publishing the review as a claude.ai page is removed. That covers
`/spec-remote-review` and `review.allowRemote`, and the "a verdict here needs
`/spec-reviewed`" caveat goes with them.

## Problem

The banner's `remote` tier is a published claude.ai page. It writes to a second
store that no wait can see, it leaves a page skitterspec can never delete, and
it needs a toggle command of its own. Now that the review server answers on the
tailnet, a reader off the wifi already has a door into the same room. That door
is printed as an `also:` sub-line under `network`, which makes it the hardest
link in the stack to find. The reader reads `network` as the wrong word and has
stopped using the published tier.

## Acceptance criteria

- On a machine with a tailnet address, the banner lists `network` (LAN URL) and
  `remote` (tailnet URL, labelled `(tailnet)`), each as its own top-level line.
- On the Mac itself, `local` (loopback) also appears, first.
- On a machine with no tailnet address, the `remote` line reads
  `— (no tailnet address on this machine)`.
- With `review.allowNetwork: false`, or a server bound to loopback, `remote` is
  off with the same command `network` names.
- The holding line names every served door shown, for example *the wait covers
  network and remote*, and a verdict pressed on the tailnet URL wakes the run.
- `/spec-remote-review` is gone after `skitterspec update`, and nothing renders,
  says or offers a published page.
- A config that still sets `review.allowRemote` renders without error or warning.
- Tearing down a spec that was published before this change still prints the
  survives-teardown notice.

## Decisions

1. **Labels are fixed by address, never by where the reader sits.**
   `local` = loopback, `network` = LAN, `remote` = tailnet. The rejected option
   relabelled the LAN `local` whenever loopback was hidden. That gives a reader
   in the VM exactly two lines, but the same URL then carries different names
   in different places, and a label that moves is one nobody learns.
2. **The published-artifact tier is removed, not kept beside the new one.** It
   was a second store the wait could not watch. That is the failure
   `spec-reports.md` spends most of its stack section guarding against, and the
   tailnet now covers the reason it existed.
3. **`remote` is in the same room as `local` and `network`.** It is the same
   server on another interface, so one wait covers all three. The
   `/spec-reviewed` caveat and the "different stores" prose go away, and the
   rule's stack section gets shorter instead of longer.
4. **`remote` follows `network`'s switch.** It needs no new config key: with
   `allowNetwork` false or a loopback bind, it is off with the same enable or
   widen command. The rejected `review.allowTailnet` would add a switch for a
   distinction nobody has asked for.
5. **A missing tailnet keeps the line and says why.** It shows
   `— (no tailnet address on this machine)`, following the rule that an off tier
   keeps its line. There is no skitterspec command to name, so the line names
   none.
6. **Only a tailnet address is promoted.** Any other alternate address (a
   second LAN interface) stays an `also:` line under `network`. If there are
   several tailnet addresses, the first becomes `remote` and the rest are its
   `also:` lines.
7. **`review.allowRemote` is accepted and ignored**, silently.
   `spec-env review allow remote` refuses and points at the `remote` line, and
   the per-spec remote sidecar is ignored. A repo that never updates its config
   breaks nothing. Rejected: a warning on every render, which accuses a healthy
   repo (`negative-checks.md` rule 4), and rejecting the key, which breaks
   every repo that set it.
8. **Teardown keeps the published-page notice.** It still reads an existing
   `.url` sidecar, because a page published before this change still outlives
   teardown, and saying so costs nothing. Every path that *makes* a page goes.
9. **`/spec-reviewed` stays.** It no longer exists for the published page, but
   it still answers every pass that arrives outside the wait window.
10. **Removing the command uses `skitterspec update`'s existing retirement**
    (manifest-based). An edited copy is kept with the usual warning.
11. **This is the fourth amendment to the stack section, and it removes rules
    rather than adding them.** It deletes a tier and its caveat and promotes an
    alternate. It adds no new kind of line. Because of that, it clears the "a
    third should have to argue harder" bar.

## Solution overview

`reviewTierStack` drops `publishedUrl`. Its third tier becomes
`{ tier: 'remote', url, label: 'tailnet', alternates }`, built from the served
alternates that `isTailnetAddress` matches. Otherwise it is off or unavailable
on the same conditions as `network`. `network.alternates` keeps only the
non-tailnet addresses. `waitCovers` returns every served tier that is shown and
has a URL. The page's `allow-remote` action, its published-mode branch and its
`remote` surface label all go. Skills, rules and docs then lose the publish flow
and name the tailnet door `remote`.

```
  network:   http://192.168.0.241:7760/…/fix-resume-windows-paths
  remote:    http://100.126.111.34:7760/…/fix-resume-windows-paths   (tailnet)
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI output | update | `spec-env review` stack: `remote:` = tailnet; no `also:` for tailnet |
| JSON | update | `--json` `tiers[2]` = tailnet tier; `covers` gains `remote` |
| CLI command | update | `spec-env review allow remote` → refusal pointing at `remote:` |
| Config key | remove | `review.allowRemote` (accepted, ignored) |
| Slash command | remove | `/spec-remote-review` |
| Review page | remove | `allow-remote` action, published-page mode |
| Skill/rule | update | `spec-reports.md` stack + banner; `spec-diff` publish flow; banners in spec, spec-next, no-spec, spec-bug, spec-hotfix |
| Docs | update | review, index, reference, provider pages; CLAUDE.md section; MIGRATION.md |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine: tailnet is the `remote` tier | ✅ | [01-engine-tiers.md](01-engine-tiers.md) |
| 2 | Page: no publish, no allow-remote | ✅ | [02-the-page.md](02-the-page.md) |
| 3 | Skills, rules and the command | ✅ | [03-skills-and-rules.md](03-skills-and-rules.md) |
| 4 | Docs and migration | ✅ | [04-docs.md](04-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-19 — Spec created.
- 2026-11-19 — Phase 1: the publish-only fragment renderer and `--publish-copy`
  were removed with the tier. `remote` follows the loopback bind as well as
  `allowNetwork`. With a `file://` page `waitCovers` is empty, and no wait line
  prints.
