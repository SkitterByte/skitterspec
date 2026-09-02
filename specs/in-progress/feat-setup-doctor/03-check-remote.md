# Phase 3 — Verify it actually works against Linear ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `--check-remote` proves the configured team resolves and the key is
accepted, rather than merely that the config is well-formed.

## Tasks

- [x] Add a `remote` check: with `--check-remote`, one `team(id:)` call via the
      existing adapter (reusing `readTeam`); without it, state `skipped` and a
      line saying how to run it — never a silent omission.
- [x] Report `broken` with what came back when the team does not resolve or the
      key is rejected, distinguishing "no key, so nothing to check" (`skipped`)
      from "key present and refused" (`broken`).
- [x] Confirm the live team key matches `linear.teamKey`, and point at
      `spec-sync retarget` on a mismatch (see `feat-team-key-retarget`) — a
      renamed team is exactly the drift this check should catch.
- [x] Never let an API error message reach the output unfiltered, in case it
      echoes the request; report status and a short reason.
- [x] Add tests with a stubbed adapter: resolves; team not found; auth rejected;
      no key → skipped; a key-mismatch pointing at retarget. Assert the key never
      appears in output on any path.
- [x] Update the phase-1 test that asserted the raw API message reaches the
      output — it predates this phase's no-relay rule and contradicted it.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

Opt-in because it is the only part that needs the network — the offline checks
must stay usable with no connectivity, which is when a setup problem is most
annoying to diagnose.
