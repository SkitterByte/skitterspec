---
linear_issue_id: "SKS-173"
---

# Phase 1 — Read a spec's real state from its worktree ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** given a spec folder, report its real Status, Developer and phase
progress — as a pure function, proved against the shapes specs actually take.

## Tasks

- [ ] Add a reader that takes a spec folder path and returns
      `{ status, developer, phasesDone, phasesTotal, bucket }`, parsing the
      `> **Status:**` and `> **Developer:**` headers and counting `✅` rows in the
      `## Phases` index.
- [ ] Handle the **legacy shapes** the rule still documents: a bare `<name>.md`,
      and a `00-overview.md` with inline phases and no index table. Neither is an
      error — count what is countable and leave the rest `null`.
- [ ] Return `status: null` rather than throwing when the file is missing or the
      header is absent. The caller renders `status unknown`; it must never drop
      the spec (Decision 5).
- [ ] Never infer a status from the folder bucket. The bucket on *this* branch is
      the very thing that lies — reading it would reproduce the bug this spec
      exists to fix.
- [ ] Tests: a normal folder spec; a spec mid-way (some `✅`); a spec with no
      phase table; a bare legacy `.md`; a missing file; a header present but
      malformed. Assert each returns rather than throws.
- [ ] Add the **stays-silent** case: a well-formed spec produces no warning,
      no `unknown`, and no diagnostic of any kind.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

Pure and injectable — it takes a path and a file reader, so the command layer can
be tested without a worktree and this can be tested without a CLI.
