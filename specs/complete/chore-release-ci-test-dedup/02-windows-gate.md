---
github_issue_id: "#309"
---

# Phase 2 — Windows gate adopts an equivalent green run ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a tag whose tree matches an earlier green Windows run, up to version
and notes, stages without re-running the suite. Proven by unit tests on the
decision and workflow-shape tests.

## Tasks

- [x] Add `scripts/windows-gate.cjs` with a pure `equivalent(diff)`. It is true
      only when every changed path is `RELEASES-*.md` or `packages/*/package.json`
      and each package.json hunk changes only the `"version"` line
- [x] Add a pure `decide({ candidates, now })` → `{ run, reason, adopted? }`.
      The candidates are earlier equivalent runs with their Windows-job status.
      Only a `success` adopts; pending means wait; anything else, and none
      at all, means `run`
- [x] Add the CLI. It lists `ci.yml` and `release.yml` runs created before this
      one (`GITHUB_TOKEN`, REST), filters them by `equivalent`, and polls the
      chosen run's `windows (node 24)` job up to 30 min. It writes
      `run`/`adopted` to `$GITHUB_OUTPUT` and exits 0 on every path, any error
      meaning `run=true`
- [x] Wire `release.yml`: a `windows-gate` job (ubuntu, `fetch-depth: 0`,
      `permissions: { contents: read, actions: read }`), `windows` with
      `needs: windows-gate` and `if: run == 'true'`, and `stage` with
      `needs: [windows-gate, windows]` and the guarded `if:` from the overview
- [x] Update the `release.yml` header ("THE WINDOWS SUITE GATES THE STAGE") and
      the Windows section in RELEASING.md: "staged" now means green on Windows
      for this tree or an equivalent one, and name the adopted run
- [x] Tests (`scripts/windows-gate.test.js`): version-only and notes-only diffs
      are equivalent; a version line plus any other line is not; a
      `package.json` outside `packages/*/` is not; success adopts; failure,
      cancelled, timed out and no candidates all run; an API error runs
- [x] Update `scripts/workflows.test.js`. Replace "stages only after its Windows
      job" with: stage needs both jobs, its `if:` refuses a skipped Windows job
      unless the gate said skip, and the gate job has no `id-token`
- [x] Run `pnpm test`; green before the phase is done

## Notes

- A stays-silent case is needed for rule 3 of `negative-checks.md`: a batch
  where main's run is still in progress must wait and then adopt it, not run
  the suite.
- After landing, check a real batch release once: one Windows run in total, and
  each tag's log names the adopted run.
