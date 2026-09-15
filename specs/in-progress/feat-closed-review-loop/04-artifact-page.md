---
linear_issue_id: "SKS-265"
---

# Phase 4 — Artifact page: db verdicts for off-LAN readers ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a reader on a phone off the LAN can review and hit a verdict on a
published artifact page, and the claim path consumes that verdict exactly like
a POSTed one.

## Tasks

- [x] The page chooses the store itself — **no `--artifact` render variant**.
      It checks for `window.claude.use`, which exists only where a viewer can
      grant capabilities, and writes the pass into the artifact's `passes`
      collection instead of POSTing. One page, three transports, each decided
      by what the page IS
- [x] `/spec-diff` §6 (publishing): publish with `capabilities: {db: {}}`,
      **one artifact per spec, same file path every render** so redeploys reuse
      the URL. `user` is deliberately **not** declared — it is not available on
      this contract and a shared `passes` collection is what the pass wants
- [x] Claim path: `/spec-diff` §6 and `/spec-reviewed` read the `passes`
      collection when the spec has a published page, merge the `blob` through
      `--notes`, and **delete the document** — a claim consumes on this
      transport too. Step 0's offer-and-confirm applies unchanged: nothing is
      automatic here, because nothing pushes from the store to the session
- [x] Send a PushNotification when the page is published, carrying the URL
- [x] Resolved the open question — answered in the overview
- [x] Tests: the published page stores rather than posts, names the render it
      came from, falls back to the clipboard with no store, and leaves both
      existing transports untouched. The blob is validated by the same
      `validateNotesBlob` path, because it rejoins at `--notes`. `pnpm test`
      green (2470 passed)

## Notes

No push exists from the artifact db to the session, so this leg stays
pull-shaped: tap the verdict, then type `/spec-reviewed` in the same
remote-control screen. Under remote control that is two taps on one device,
which is the ergonomic bar the LAN flow meets with zero taps.

**Proved, not asserted.** This phase's own page was published while building it
(`dec28df2`), and the read-back path was exercised against the live store — an
empty `passes` collection is a valid answer and shows the wiring reaches it.
The write half is covered by unit tests against a fake runtime, because pressing
a button in a hosted browser page is not something a test can do.
