---
linear_issue_id: "SKS-368"
---

# Phase 1 — Amend the wait contract in spec-reports.md ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-reports.md` prefers a persistent watch primitive and reads a
kill as a death — proven by updated pinning tests, including one that shows
the old ambiguity default is gone.

## Tasks

- [x] Add the persistent-watch preference to the wait section: run the
      engine's wait under a harness primitive that survives idle and whose
      deliberate stop is an explicit act (example: Claude Code's `Monitor`,
      `persistent: true`, stopped via TaskStop); else background the command.
- [x] Re-word the re-arm paragraph: a wait that dies without a verdict
      re-arms silently on the same window; treat a kill as deliberate ONLY on
      positive evidence (this session called TaskStop, or the operator said
      stop). Keep the 12-hour bound and the degraded banner unchanged.
- [x] Note why stdout is monitor-ready (heartbeat on stderr — SKS-358), so
      the next editor does not move it back.
- [x] Update the asset-pinning tests that hold these sentences; add a
      `doesNotMatch` proving "treat it as deliberate" no longer covers the
      ambiguous kill.
- [x] Run `node --test` — green before the phase is done.

## Notes

The contract's own history (two amendments, "a third should have to argue
harder") applies to the banner shape, not the wait mechanism — this changes
no banner line.
