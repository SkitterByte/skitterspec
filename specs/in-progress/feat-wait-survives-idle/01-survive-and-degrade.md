---
linear_issue_id: "SKS-359"
---

# Phase 1 — The wait survives, and says so honestly when it cannot ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a backgrounded wait is never silent, an unexpected death is re-armed
on the same window, and after 12 hours the banner stops claiming to hold.

## Tasks

- [ ] Add an `onHeartbeat` hook to `waitForPass`
      (`packages/common/src/env/review.js`) — called on its own cadence,
      independent of the 400ms poll, with the elapsed time and the window start.
      Pure enough to test with an injected clock, like `sleep` already is.
- [ ] `specEnvReviewWait` writes the heartbeat to **`process.stderr`**, every 5
      minutes by default. Never to stdout: that is the event stream under a
      monitor and the parsed result under a backgrounded task.
- [ ] Add `--heartbeat <seconds>`, with `0` disabling it. Default 300.
- [ ] **Suppress it entirely under `--json`.** That mode has one
      machine-readable payload and must not grow a second stream.
- [ ] Write the re-arm contract into `.claude/rules/spec-reports.md`, beside the
      banner it exists to keep true: a wait that ended with no verdict and was
      not stopped by the operator is re-armed on the **same** `--since`, silently,
      while that window is younger than 12 hours.
- [ ] Define the **degraded banner state** in the same rule — past the bound, the
      holding line is replaced by the sentence the contract already uses for a
      transport that cannot push into the conversation (*press a verdict, then
      type `/spec-reviewed` — I cannot see it until you do*). A state for an
      existing sentence, not a new sentence.
- [ ] Point `/spec`, `/spec-next`, `/spec-bug` and `/no-spec` at that rule from
      their wait steps. **Do not restate it in four places** — the stack in this
      same rule is written once for exactly this reason.
- [ ] Sync into the shipping packages (`npm run build` — they are generated).
- [ ] Tests:
      - the heartbeat fires on its cadence with an injected clock, and goes to
        stderr, never stdout;
      - `--heartbeat 0` and `--json` both produce none;
      - the poll cadence is unchanged by any of it;
      - **stays silent** — a wait that ends `arrived`, `ambiguous` or `unusable`
        is reported exactly as it is today, since none of those is a death;
      - the rule carries the re-arm contract and the degraded state, and the four
        skills reference it rather than restating it.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**The re-arm lives in prose, and this is the one place that is defensible.**
It is a harness behaviour — the skill reacting to its own task dying — and there
is no engine process left alive to hold it, because the process being killed *is*
the engine. Everything testable is pushed into the engine (the heartbeat) or into
an asset assertion (the rule says it; the skills point at it), which is as close
to enforcement as this half can get.

**An operator stopping the wait is not a death.** Re-arming over a deliberate
`TaskStop` would make the wait unstoppable, which is worse than a wait that
stops. Where the two cannot be told apart, treat it as deliberate and do not
re-arm — the cannot-tell case routes to inaction
(`.claude/rules/negative-checks.md` rule 4), and the cost of being wrong is one
`/spec-reviewed` rather than a loop nobody can break.

**Do not report a re-arm.** Nothing happened, the window is unchanged, and a line
saying so on every death would turn a quiet, working loop into a stream of
non-events — the same reason consecutive no-op ticks are collapsed elsewhere.

**Verify the heartbeat actually helps before trusting it.** The silence
hypothesis rests on a single contrasting case. If a wait still dies over a long
idle with the heartbeat running, that is evidence the trigger is session
idleness, and the re-arm is what is carrying the loop — worth recording in the
Changelog either way, because it is the only way this gets settled.
