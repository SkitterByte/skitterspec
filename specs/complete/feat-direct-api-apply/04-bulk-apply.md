# Phase 4 — Bulk `apply --all <bucket>` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** first-time adoption on an established repo is one command — every spec
in a bucket pushed and linked in a single run, resumable after an interruption.

## Tasks

- [x] Add `spec-sync apply --all <bucket>` (`backlog`|`in-progress`|`complete`|
      `cancelled`): compute each spec's plan, apply it, continue past a spec that
      fails rather than aborting the run.
- [x] Reuse phase 2's per-object stamping for resumability: re-running after an
      interruption skips what is already linked and mints no duplicates.
- [x] Throttle to stay inside Linear's API rate limits, and back off on a 429
      rather than failing the run.
- [x] Print progress per spec and a closing summary: created, updated, skipped
      (already current), failed — with the reason for each failure.
- [x] Never truncate silently — if anything is skipped or capped, say so.
- [x] Exit non-zero when any spec failed, so a scripted backfill can be checked.
- [x] Add tests: a multi-spec run against an injected `fetch`; one spec failing
      does not stop the rest and is reported; a re-run after a simulated
      interruption creates nothing new; a 429 backs off and completes. Run the
      project's test command — green before the phase is done.

## Notes

**Measured, against a generated 250-spec corpus** (3 phases each, ~3.74 MB of
source, Linear faked so this is engine cost only):

```
specs: 250 · objects written: 1000 · exit 0 · created 250 · failed 0
engine wall time: 0.7s
```

So the engine is nowhere near the bottleneck.
**The "under five minutes" criterion is not something this phase can claim**,
because wall time is network-bound and the design issues 8 sequential requests
per 3-phase spec — 4 writes and 4 read-backs — or 2000 for the corpus above:

| latency | 2000 sequential requests |
|---------|--------------------------|
| 80 ms | 2.7 min |
| 150 ms | 5.0 min |
| 250 ms | 8.3 min |

It comfortably beats the multi-hour MCP session either way, but "under five
minutes" holds only at good latency.

**The read-backs are half of that, and they were kept deliberately.** The create
and update mutations already return the saved issue, so its `description` could
serve as the read-back for free and halve the requests. That assumes Linear's
mutation response is byte-identical to what a later read returns — plausible, but
unverified, and `verify` exists precisely because Linear's save-time
reserialisation is not to be trusted. Weakening an inherited fidelity check to
hit a performance target is the wrong trade to make on an assumption. The
honest follow-ups, in order of preference:

1. Verify the mutation-response equivalence against a real workspace, then drop
   the separate read (halves the requests, no fidelity lost).
2. Failing that, run specs concurrently with a small pool — the 429 backoff below
   already makes that survivable.

**Throttling is reactive, not proactive.** The task said "throttle to stay inside
Linear's rate limits"; the implementation instead retries on 429, honouring
`Retry-After` and otherwise backing off exponentially (capped at 60s, 5 retries).
A fixed proactive rate would need a published limit to target, and inventing one
would either throttle needlessly or fail anyway. Reacting to what Linear actually
says is the mechanism that works without a guess.
