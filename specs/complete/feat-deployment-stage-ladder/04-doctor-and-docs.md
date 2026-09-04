---
linear_issue_id: "SKS-45"
---

# Phase 4 — Doctor ladder check + CI wiring docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a misconfigured ladder is caught at setup rather than by tickets that
quietly never reach Done, and the pipeline wiring is written down once.

## Tasks

- [x] Add a doctor check: when `release.stages` is declared, warn if the last
      rung is not a `completed`-type state — issues that finish the ladder would
      never close. Warn, never fail.
- [x] Run it on the **API transport only**: `listIssueStates` returns
      `{id, name, type}`, while `--workspace-states` carries names alone. On MCP,
      say the check was skipped rather than guessing a type.
- [x] Name the blind spot in a comment beside the check: a workspace whose
      terminal state is reached by Linear automation is healthy and will trip it.
- [x] Add the ladder to `/spec-linear-setup`'s interview so a project declares it
      at setup rather than by hand-editing.
- [x] Write `docs/` CI wiring: the stage-per-pipeline mapping, the API key as a
      pipeline secret, the explicit range, and why a hand-rolled GraphQL `curl`
      loses retry and state-name validation.
- [x] Tests: a completed-type last rung is silent; a `started`-type last rung
      warns; **no `release.stages` declared is silent** (the stays-silent case);
      the MCP path reports skipped rather than warning.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Done 2026-09-04. Full suite green: **1187/1187** (+17 over phase 3).

**The guide went to `packages/linear/assets/core/ci-stages.md`, not `docs/`.**
`docs/` is the marketing site — self-contained HTML with per-page og:url and a
link-integrity test. A CI guide belongs with the config it describes, and
`assets/core/` installs into the consumer's own `specs/.core/`, where someone
wiring a pipeline would actually look. The installer enumerates that folder
dynamically, so it ships with no wiring change.

**`doctor` gained a `warn` state.** There was no room between `ok` and `broken`
for "worth saying, not a failure". It counts toward the attention line and leaves
the exit code alone, exactly as `missing` does.

**An empty workspace-state list now reads as unchecked, not as missing rungs.**
Written first as a check that accused every rung off an empty list — a test that
accepted either outcome is what exposed it. A lookup that saw nothing is not a
workspace without those states (negative-checks rule 1).

**`init-config --stage <key>=<state>` was needed** for the interview to write a
ladder at all; validation is left entirely to `mergeConfig` so there is one place
that decides what a valid ladder is.

Verified against the live workspace, read-only: `doctor --check-remote` reports
`ok` for a two-rung ladder and `warn` for one ending on a `started` state, and a
`stage` dry run over this repo's real history correctly refused to move SKS-41
because its own spec is still in progress.

`docs-claims.test.js` checks documentation claims against the code — the new
docs page is subject to it, so keep example commands real.
