# Phase 2 — `spec-sync doctor` — detect, read-only ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-sync doctor` reports identifier drift against the workspace's
current team key and writes nothing, proven by a test whose refs are mostly
archived — the case the naive check gets wrong.

## Tasks

- [ ] Add `readTeam(teamId) → { key, name }` to the API adapter
      (`packages/linear/src/api.js`) and the MCP adapter, keeping the two
      interchangeable as `makeAdapter` already requires.
- [ ] Verify during build that Linear's `issue(id:)` resolves **archived**
      issues. If it does not, that invalidates decision 5 — stop and re-decide
      rather than silently falling back to a bulk query.
- [ ] Add `specSyncDoctor` to `packages/linear/src/cli-sync.js` and register it
      in the `spec-sync` subcommand dispatch; read-only, exit 0.
- [ ] Detect drift: stamped identifier prefixes (`linear_identifier`,
      `linear_issue_id`, `linear_url`) that disagree with the team key read from
      Linear, plus a stale `config.linear.teamKey` and stale
      `linear-base/<ID>.base.json` filenames.
- [ ] Verify each drifted ref per-ref: for `OLD-N`, `adapter.readIssue('NEW-N')`
      must exist. Report **drift** and **missing** as separate categories — a ref
      that resolves is repairable, one that does not is a different problem.
- [ ] Report counts by category with file counts, and point at `--write`
      (phase 3) without offering to run it yet.
- [ ] Add `packages/linear/test/cli-doctor.test.js` with a fake adapter: a repo
      whose refs are **mostly archived** must report 0 missing, not a wall of
      false accusations; a genuinely absent ref must still be reported; a repo
      already on the current key must report no drift.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The archived case is the whole point of the test. The hand-run that motivated
this reported 146 of 198 refs as non-existent — which looks like a corrupt repo
— purely because `team.issues` excludes archived issues and caps at 250. Going
per-ref removes the failure mode by construction; the test exists to keep anyone
from optimising it back in.

Linear preserves the issue number across a team rename, but the check must
confirm that rather than assume it.
