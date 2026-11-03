---
github_issue_id: "#103"
---

# Phase 3 — `/spec-incident` no-outage routing ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-incident` routes down when its grill finds no live outage —
the costliest wrong door (no review page, starts in `in-progress/`) gets an
explicit exit.

## Tasks

- [x] Add the check to `packages/common/assets/skills/spec-incident/SKILL.md`'s
      grill: when the answers establish nothing is down or degraded **right
      now** (it recovered, it never was live, it is a risk rather than an
      event), propose the right door — a defect → `/spec-bug` (on a released
      version → `/spec-hotfix`), otherwise → `/spec` — confirm first, and hand
      off in-session with the grilled context. A past outage the user wants a
      record of stays an incident: "it is over" is not "it never happened" —
      the signal is *no outage to record*, not *no outage now*.
- [x] Keep the grill fast: the check is the grill's existing questions read
      honestly (item 1 "what is down", item 2 "since when"), not an extra
      round trip.
- [x] Extend the assets test to pin the section. Run the package tests — green
      before the phase is done.

## Notes

The existing "fixes are separate specs" routing table in `/spec-incident`
(mainline defect → `/spec-bug`, tooling → chore, manual → issue) is about an
incident's *fixes*, not about mis-entry — leave it; this check sits earlier,
in the grill itself.
