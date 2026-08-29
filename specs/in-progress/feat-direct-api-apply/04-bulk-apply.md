# Phase 4 — Bulk `apply --all <bucket>` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** first-time adoption on an established repo is one command — every spec
in a bucket pushed and linked in a single run, resumable after an interruption.

## Tasks

- [ ] Add `spec-sync apply --all <bucket>` (`backlog`|`in-progress`|`complete`|
      `cancelled`): compute each spec's plan, apply it, continue past a spec that
      fails rather than aborting the run.
- [ ] Reuse phase 2's per-object stamping for resumability: re-running after an
      interruption skips what is already linked and mints no duplicates.
- [ ] Throttle to stay inside Linear's API rate limits, and back off on a 429
      rather than failing the run.
- [ ] Print progress per spec and a closing summary: created, updated, skipped
      (already current), failed — with the reason for each failure.
- [ ] Never truncate silently — if anything is skipped or capped, say so.
- [ ] Exit non-zero when any spec failed, so a scripted backfill can be checked.
- [ ] Add tests: a multi-spec run against an injected `fetch`; one spec failing
      does not stop the rest and is reported; a re-run after a simulated
      interruption creates nothing new; a 429 backs off and completes. Run the
      project's test command — green before the phase is done.

## Notes

Acceptance from the report: a 250-spec cold push in a single command, well under
five minutes. Worth measuring against a generated fixture corpus rather than
asserting it, so the number is real.
