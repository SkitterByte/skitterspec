---
github_issue_id: "#223"
---

# Phase 1 — Engine: reader signal and stack ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine hides `local` from every stack when the reader is signalled
as remote, and changes nothing otherwise. Unit tests on the stack and CLI
output tests prove it.

## Tasks

- [x] Add a pure `readerLocation(env)` in `packages/common/src/env/review.js`.
      `SKITTERSPEC_READER` = `remote`/`local` wins (case-insensitive), then
      `SSH_CONNECTION` → `remote`, else `null`. Add a comment naming the blind
      spot: SSH with a port forward makes loopback reachable.
- [x] Have `reviewTierStack` take `reader`. When it is `remote` and the network
      tier has a URL, mark `local` `{ hidden: true, reason }`. When the network
      tier has no URL, add the note
      `not reachable from the reader's machine` instead.
- [x] Make `reviewTierLine` print nothing for a hidden tier, and filter the
      empty entries at every caller in `cli.js` (review render, epic page,
      tada page, re-show, serve status).
- [x] Pass `readerLocation(process.env)` at each `reviewTierStack` call site.
- [x] Derive the wait-coverage line from the visible served tiers. Emit it as
      `covers` in `--json` and use it in the re-show text (`cli.js` re-show
      block).
- [x] Tests:
  - [x] Remote with network serving → `local` hidden in text, present and
        `hidden` in JSON.
  - [x] SSH only → hidden.
  - [x] `READER=local` + SSH → shown.
  - [x] Stays silent: no variable set → output byte-identical to today.
  - [x] Unknown value → today.
  - [x] Remote + network off → `local` kept with the note.
  - [x] `covers` → `network` only.
- [x] Run `pnpm test`, green.

## Notes

The `skitterspec-*` provider packages carry copies of `cli.js` built from
common, so edit only `packages/common` and let the build carry it.
