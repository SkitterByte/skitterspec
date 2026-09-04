---
linear_issue_id: "SKS-45"
---

# Phase 4 — Doctor ladder check + CI wiring docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a misconfigured ladder is caught at setup rather than by tickets that
quietly never reach Done, and the pipeline wiring is written down once.

## Tasks

- [ ] Add a doctor check: when `release.stages` is declared, warn if the last
      rung is not a `completed`-type state — issues that finish the ladder would
      never close. Warn, never fail.
- [ ] Run it on the **API transport only**: `listIssueStates` returns
      `{id, name, type}`, while `--workspace-states` carries names alone. On MCP,
      say the check was skipped rather than guessing a type.
- [ ] Name the blind spot in a comment beside the check: a workspace whose
      terminal state is reached by Linear automation is healthy and will trip it.
- [ ] Add the ladder to `/spec-linear-setup`'s interview so a project declares it
      at setup rather than by hand-editing.
- [ ] Write `docs/` CI wiring: the stage-per-pipeline mapping, the API key as a
      pipeline secret, the explicit range, and why a hand-rolled GraphQL `curl`
      loses retry and state-name validation.
- [ ] Tests: a completed-type last rung is silent; a `started`-type last rung
      warns; **no `release.stages` declared is silent** (the stays-silent case);
      the MCP path reports skipped rather than warning.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`docs-claims.test.js` checks documentation claims against the code — the new
docs page is subject to it, so keep example commands real.
