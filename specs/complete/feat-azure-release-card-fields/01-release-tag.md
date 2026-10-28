---
github_issue_id: "#51"
---

# Phase 1 — Release tag on attach ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `release create --apply` tags every attached spec story with the
release tag, backfilling ones that are already linked. Proven by adapter tests
against a fake fetch.

## Tasks

- [x] Add `releases.ticketTag` (default `true`) to `DEFAULT_CONFIG` and its
      merge/validation in `packages/azure-boards/src/config.js`
- [x] Pass `ticketTag` into `makeApiAdapter` from `cli-sync.js`, next to
      `releaseType`
- [x] In `releaseAttach`, batch-read the tickets' `System.Tags`, then patch each
      untagged ticket with its existing tags plus the release tag (`; `-joined).
      The check is independent of the Related link, and the comment stays
      new-link-only
- [x] Return `tagged` from `releaseAttach`, and show it on `create`'s `issues:`
      line, only where the adapter returns it (other providers are unchanged)
- [x] Document `releases.ticketTag` in `assets/core/azure-boards.config.md`,
      including the backfill by re-running `create`
- [x] Tests: tags an untagged ticket, keeps the tags it already has, leaves an
      already-tagged ticket alone (stays silent), backfills a linked but
      untagged ticket without a second comment, `ticketTag: false` writes no
      tags. Run `pnpm -r typecheck` (where defined) and
      `pnpm --filter ./packages/azure-boards test` — green

## Notes

`System.Tags` is a `; `-separated string, and the `add` op replaces it whole
(Decision 4). Compare tags case-insensitively, because Azure tags are
case-insensitive.
