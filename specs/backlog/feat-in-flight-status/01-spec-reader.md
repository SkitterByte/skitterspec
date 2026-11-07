---
linear_issue_id: "SKS-173"
github_issue_id: "#21"
---

# Phase 1 — Read a spec's real state from its worktree ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** given a spec folder, report its real Status, Developer and phase
progress — as a pure function, proved against the shapes specs actually take.

## Tasks

- [ ] Move `phaseProgress` / `progressText` out of `env/handoff.js` into a
      shared module, and point `handoff.js` at it with no behaviour change (its
      tests stay green unedited).
- [ ] Add a reader that takes a spec folder path and returns
      `{ bucket, phasesDone, phasesTotal, currentPhase, status, developer }`.
      Progress comes from the phase files' H1 emoji via `phaseProgress`.
      `status` and `developer` come from the `> **Status:**` / `> **Developer:**`
      headers, and are `null` when absent, which is the normal case under
      `pull` (Decision 1).
- [ ] Handle the **legacy shapes** the rule still documents: a bare `<name>.md`,
      and a `00-overview.md` with inline phases and no index table. Neither is an
      error — count what is countable and leave the rest `null`.
- [ ] Return rather than throw when the folder is missing or unreadable, marked
      so the caller renders `status unknown`; it must never drop the spec
      (Decision 5). An absent `Status:` header is **not** unknown: under `pull`
      it is the expected shape, and the bucket and progress still answer.
- [ ] Read the bucket from the **worktree's** copy, never from this branch. The
      bucket on *this* branch is the very thing that lies, and reading it would
      reproduce the bug this spec exists to fix.
- [ ] Tests: a normal folder spec; a spec mid-way (some `✅`, one `🔄`); a
      `pull`-era spec with no `Status:`/`Developer:` header (no unknown, no
      warning); a spec with no phase files; a bare legacy `.md`; a missing
      folder; a header present but malformed. Assert each returns rather than
      throws.
- [ ] Add the **stays-silent** case: a well-formed spec produces no warning,
      no `unknown`, and no diagnostic of any kind.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

Pure and injectable — it takes a path and a file reader, so the command layer can
be tested without a worktree and this can be tested without a CLI.
