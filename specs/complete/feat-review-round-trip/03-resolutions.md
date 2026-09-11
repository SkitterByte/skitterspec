---
linear_issue_id: "SKS-160"
---

# Phase 3 — Resolutions round-trip ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a comment the agent has acted on comes back to the page struck through
with a one-line what-I-did, so the next read verifies the fix instead of trusting
it.

## Tasks

- [x] Add `--resolve <file>` to `specEnvReview`, the flag parser and the usage
      line: the file is `[{ id, note }]`, attaching `resolved: {at, note}` to each
      named comment, then re-rendering.
- [x] An id that matches no comment is **reported and skipped**, never invented
      and never fatal — the other resolutions still land. A resolution naming a
      comment that does not exist is a mistake to surface, not a reason to lose
      the work that was done.
- [x] Render resolved comments in the page: struck through, with the resolution
      note beneath, and excluded from the `[ Copy review (N) ]` pending count.
      They are history, not an outstanding ask.
- [x] Re-resolving an already-resolved comment overwrites its note rather than
      stacking; the newest what-I-did is the one that matches the code.
- [x] Report resolution counts in the human-readable output and in `--json`
      (`notes.resolved`).
- [x] Add tests: resolve by id; an unknown id skipped while its siblings land;
      re-resolve overwrites; resolutions survive a later `--notes` merge
      (Decision 5 — the merge must not drop them); a resolved comment is absent
      from the pending count.
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

**Marks are information, not a gate.** An accept tick tells the person reading
what they have already read; nothing anywhere counts them, requires them, or
refuses on them — not `/spec-diff`, not `/spec-complete`, not a phase ending with
comments still open. If that is ever wanted it becomes a
**config key defaulting to off**, decided deliberately; it never arrives as a
tidy-up.

Resolutions are written by the agent and comments by the human, but both are the
same file and the same merge — two flags because the shapes and the validators
differ, not because the store does.

Two of these were already true from phase 2 and were verified rather than built:
the page renders `resolved` comments struck through with their note, and the
pending count never included stored comments — it counts only what **you** have
written and not yet handed over, never outstanding work.

One case the task list did not name: `--resolve` against a spec with
**no notes recorded at all**. Every id would be unknown, so it says that once and
writes nothing, rather than listing each id back as a mistake or minting an empty
sidecar.
