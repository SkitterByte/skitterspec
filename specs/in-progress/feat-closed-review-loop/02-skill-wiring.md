---
linear_issue_id: "SKS-263"
---

# Phase 2 — Skill wiring: arm, wait, auto-claim, doc sweep ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the phase-end flow arms the gate, serves the page, and ends the turn
watching for the verdict; a POSTed verdict resumes the session and is acted on
— with `/spec-reviewed` intact as the fallback, and every doc stating the old
invariant rewritten.

## Tasks

- [ ] `/spec-next` §5: after the phase-end render/serve, run
      `spec-env review arm`; where the harness has a file-watch facility
      (Monitor), start one on the spec's `.pending.json` and end the turn
      saying the verdict is being watched for — replacing the non-blocking
      question; where it has none, keep today's Review row and say
      `/spec-reviewed` is the way back
- [ ] `/spec-next` §2 pre-flight: consult `spec-env review gate --json` and
      refuse (⏸, per `spec-reports.md`) to build the next phase while the gate
      is armed, naming the page link, `/spec-reviewed`, and
      `spec-env review skip "<reason>"` as the three exits
- [ ] `/spec-diff`: add the same wait mode for anytime use (serve, watch, end
      turn) — explicitly **without** arming the gate on mid-phase renders
- [ ] Auto-claim rule in `/spec-diff` (and referenced from `/spec-reviewed`):
      on wake, claim **only** a pass whose render was minted during the current
      wait window for this spec; any other pass is reported as waiting, never
      claimed — this scoping is what replaces "never claims unasked"
- [ ] Route the claimed verdict exactly as `/spec-reviewed` does today
      (`Commit` → commit skill · `Commit & Continue` → commit then
      `/spec-next`, stopping there · `changes` → work them, gate stays armed ·
      `discuss` → report and ask)
- [ ] Doc sweep for the premise inversion: rewrite the "a device that reaches
      your page cannot reach your conversation" passages and the gate story in
      `packages/common/assets/rules/spec-planning.md`, the repo `CLAUDE.md`
      spec-workflow section, and the `spec-diff` / `spec-reviewed` skill
      rationale — the serve token is the credential, the wait window is the
      scope, `/spec-reviewed` is fallback and disambiguation
- [ ] Show the gate on the page: the outcome log as history (a skip reads as a
      skip, with its reason), and fix `drawLog`, which currently maps every
      verdict but `changes` to "discussed" — including `commit` (carried over
      from phase 1)
- [ ] Tests: skill prose is not unit-testable, but the engine calls it leans
      on are — extend phase 1's tests with the arm-at-phase-end +
      claim-disarms sequence as one integration-shaped test; `pnpm test` green

## Notes

The wait must end the turn, not poll: the watch re-invokes the session when
the pending file changes. A verdict of `commit` acting unattended is accepted
risk — the commit is local and reversible, and the page URL carries the
48-bit token.
