---
linear_issue_id: "SKS-200"
---

# Phase 3 — Account for a server nobody started ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a LAN listener the operator did not type stays visible and gets cleaned
up. This is the half of `feat-diff-reaches-the-reader` decision 5 that was right,
applied where it actually bites.

Typed by hand, `serve --host 0.0.0.0` prints its own warning and the operator
knows a listener is up. Started for them by phase 1, nobody does — and one token
unlocks every spec's diff for as long as it runs.

- [x] When `review` starts a server (`started: true`), say so on its own line,
      including that it serves every provisioned spec and how to stop it. When it
      reuses a running one, do not repeat the warning on every phase — say it
      once, at the point of starting.
- [x] `spec-env down <spec>` stops the review server when the spec being torn down
      is the last one with a worktree. With others still provisioned the server is
      still doing its job, so leave it and say nothing.
- [x] `spec-env prune` reaps a review server whose pidfile is stale, alongside the
      orphaned volumes it already sweeps.
- [x] Teardown reporting a surviving **published** page is untouched. That is a
      different thing this tooling genuinely cannot remove, and it is already
      correct.

## Tests

- [x] Starting via `review` prints the exposure warning; the second `review` call
      does not repeat it.
- [x] `down` on the last provisioned spec stops the server and says so.
- [x] **Stays silent:** `down` with another spec still provisioned leaves the
      server running and reports nothing about it.
- [x] `down` with no server running is a no-op, not a failure — it must not
      accuse a healthy teardown of leaving something behind.
- [x] A stale pidfile is treated as not-running and overwritten, never reported
      as an error.

## Outcome

Green — 2038 pass, 0 fail.

**One deviation, and it is the load-bearing one.** The task said `spec-env down`
*stops* the server. It does not: `down` is a **planner**, not an executor — it
prints a `run these:` block the caller runs, and its only real write is freeing
the registry slot. Making it kill a process for this one case would have made it
two different things depending on what was running. So teardown **names** the
server in its own section, the way it already names a surviving published page,
and `/spec-complete` and `/spec-cancel` run it with the rest of the block.

If that turns out to be too weak in practice — a server surviving because a skill
skipped a line — the fix is to make the stop part of the planned commands rather
than to make `down` an executor.

Phase 1 had already delivered the first task (the warning prints only when this
call *started* the server). What it had not done is **test** the "only once"
half, so a reuse assertion was added: the first render carries the exposure
warning and the second does not. An untested "say it once" is one refactor away
from becoming "say it every time", which is how a real warning turns into
wallpaper.

`prune` reaps a stale pidfile **before** the docker section, deliberately: a
pidfile left by a crashed server is not docker's business, and every branch of
that section can return early — including the one that fires when Docker is not
running at all.
