---
linear_issue_id: "SKS-265"
---

# Phase 4 — Artifact page: db verdicts for off-LAN readers ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a reader on a phone off the LAN can review and hit a verdict on a
published artifact page, and the claim path consumes that verdict exactly like
a POSTed one.

## Tasks

- [ ] Add `spec-env review <spec> --artifact`: render the same page with the
      verdict/notes submission wired to the artifact database
      (`window.claude` db + user capabilities) instead of the POST endpoint,
      writing one pass document keyed by render ID
- [ ] `/spec-diff` §6 (publishing): publish the artifact page via the harness
      Artifact tool with db + user capabilities declared, **one artifact per
      spec, same file path every render** so redeploys reuse the URL and
      nothing accumulates; load the artifact-capabilities skill before first
      wiring
- [ ] Claim path: `/spec-reviewed` (and the wait-window claim) additionally
      checks the artifact db when the spec has a published page — read the
      pass row, merge it through the existing claim machinery, **delete the
      row** so a code works once there too
- [ ] Send a PushNotification when the page is published, carrying the URL
- [ ] Resolve the open question: verify what accumulates across a long spec
      (artifact versions, db rows) and record the answer in the overview
- [ ] Tests: pass-document shape validated by the same `validateNotesBlob`
      path as the POST route; render-variant unit tests; `pnpm test` green

## Notes

No push exists from the artifact db to the session, so this leg stays
pull-shaped: tap the verdict, then type `/spec-reviewed` in the same
remote-control screen. Under remote control that is two taps on one device,
which is the ergonomic bar the LAN flow meets with zero taps.
