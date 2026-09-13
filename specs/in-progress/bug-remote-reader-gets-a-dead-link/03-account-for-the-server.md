---
linear_issue_id: "SKS-200"
---

# Phase 3 — Account for a server nobody started ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a LAN listener the operator did not type stays visible and gets cleaned
up. This is the half of `feat-diff-reaches-the-reader` decision 5 that was right,
applied where it actually bites.

Typed by hand, `serve --host 0.0.0.0` prints its own warning and the operator
knows a listener is up. Started for them by phase 1, nobody does — and one token
unlocks every spec's diff for as long as it runs.

- [ ] When `review` starts a server (`started: true`), say so on its own line,
      including that it serves every provisioned spec and how to stop it. When it
      reuses a running one, do not repeat the warning on every phase — say it
      once, at the point of starting.
- [ ] `spec-env down <spec>` stops the review server when the spec being torn down
      is the last one with a worktree. With others still provisioned the server is
      still doing its job, so leave it and say nothing.
- [ ] `spec-env prune` reaps a review server whose pidfile is stale, alongside the
      orphaned volumes it already sweeps.
- [ ] Teardown reporting a surviving **published** page is untouched. That is a
      different thing this tooling genuinely cannot remove, and it is already
      correct.

## Tests

- [ ] Starting via `review` prints the exposure warning; the second `review` call
      does not repeat it.
- [ ] `down` on the last provisioned spec stops the server and says so.
- [ ] **Stays silent:** `down` with another spec still provisioned leaves the
      server running and reports nothing about it.
- [ ] `down` with no server running is a no-op, not a failure — it must not
      accuse a healthy teardown of leaving something behind.
- [ ] A stale pidfile is treated as not-running and overwritten, never reported
      as an error.
