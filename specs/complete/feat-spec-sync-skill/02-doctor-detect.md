# Phase 2 — `spec-sync doctor` — detect, read-only ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-sync doctor` reports identifier drift against the workspace's
current team key and writes nothing, proven by a test whose refs are mostly
archived — the case the naive check gets wrong.

## Tasks

- [x] Add `readTeam(teamId) → { key, name }` to the API adapter
      (`packages/linear/src/api.js`). API-only, and `doctor` refuses over MCP —
      see the Changelog: the operation contract is one-directional, and a
      per-ref sweep over MCP would be a model round-trip per ref.
- [x] Verify during build that Linear's `issue(id:)` resolves **archived**
      issues. If it does not, that invalidates decision 5 — stop and re-decide
      rather than silently falling back to a bulk query.
- [x] Add `specSyncDoctor` to `packages/linear/src/cli-sync.js` and register it
      in the `spec-sync` subcommand dispatch; read-only, exit 0.
- [x] Detect drift: stamped identifier prefixes (`linear_identifier`,
      `linear_issue_id`, `linear_url`) that disagree with the team key read from
      Linear, plus a stale `config.linear.teamKey` and stale
      `linear-base/<ID>.base.json` filenames.
- [x] Verify each drifted ref per-ref: for `OLD-N`, `adapter.readIssue('NEW-N')`
      must exist. Report **drift** and **missing** as separate categories — a ref
      that resolves is repairable, one that does not is a different problem.
- [x] Report counts by category with file counts, and point at `--write`
      (phase 3) without offering to run it yet.
- [x] Add `packages/linear/test/cli-doctor.test.js` with a fake adapter: a repo
      whose refs are **mostly archived** must report 0 missing, not a wall of
      false accusations; a genuinely absent ref must still be reported; a repo
      already on the current key must report no drift.
- [x] Scan the identifier keys **inside** each snapshot's `subIssues` map, not
      just the filename — that is where the bulk of a linked repo's refs live.
- [x] Count stale refs in spec **prose** as a separate `mentions` category,
      reported but never repaired, so the report cannot imply `--write` leaves
      the repo fully retargeted.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

The archived case is the whole point of the test. The hand-run that motivated
this reported 146 of 198 refs as non-existent — which looks like a corrupt repo
— purely because `team.issues` excludes archived issues and caps at 250. Going
per-ref removes the failure mode by construction; the test exists to keep anyone
from optimising it back in.

Linear preserves the issue number across a team rename, but the check must
confirm that rather than assume it.
