---
linear_issue_id: "SKS-160"
---

# Phase 3 — Resolutions round-trip ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a comment the agent has acted on comes back to the page struck through
with a one-line what-I-did, so the next read verifies the fix instead of trusting
it.

## Tasks

- [ ] Add `--resolve <file>` to `specEnvReview`, the flag parser and the usage
      line: the file is `[{ id, note }]`, attaching `resolved: {at, note}` to each
      named comment, then re-rendering.
- [ ] An id that matches no comment is **reported and skipped**, never invented
      and never fatal — the other resolutions still land. A resolution naming a
      comment that does not exist is a mistake to surface, not a reason to lose
      the work that was done.
- [ ] Render resolved comments in the page: struck through, with the resolution
      note beneath, and excluded from the `[ Copy review (N) ]` pending count.
      They are history, not an outstanding ask.
- [ ] Re-resolving an already-resolved comment overwrites its note rather than
      stacking; the newest what-I-did is the one that matches the code.
- [ ] Report resolution counts in the human-readable output and in `--json`
      (`notes.resolved`).
- [ ] Add tests: resolve by id; an unknown id skipped while its siblings land;
      re-resolve overwrites; resolutions survive a later `--notes` merge
      (Decision 5 — the merge must not drop them); a resolved comment is absent
      from the pending count.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

Resolutions are written by the agent and comments by the human, but both are the
same file and the same merge — two flags because the shapes and the validators
differ, not because the store does.
