---
linear_issue_id: "SKS-263"
---

# Phase 2 — Skill wiring: arm, wait, auto-claim, doc sweep ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the phase-end flow arms the gate, serves the page, and ends the turn
watching for the verdict; a POSTed verdict resumes the session and is acted on
— with `/spec-reviewed` intact as the fallback, and every doc stating the old
invariant rewritten.

## Tasks

- [x] `/spec-next` §5: after the phase-end render/serve, run
      `spec-env review arm`; where the harness has a file-watch facility
      (Monitor), start one on the spec's `.pending.json` and end the turn
      saying the verdict is being watched for — replacing the non-blocking
      question; where it has none, keep today's Review row and say
      `/spec-reviewed` is the way back
- [x] `/spec-next` §2 pre-flight: consult `spec-env review gate --json` and
      refuse (⏸, per `spec-reports.md`) to build the next phase while the gate
      is armed, naming the page link, `/spec-reviewed`, and
      `spec-env review skip "<reason>"` as the three exits
- [x] `/spec-diff` §4b: the wait mode for anytime use (serve, watch, end
      turn) — explicitly **without** arming the gate on mid-phase renders
- [x] Auto-claim rule in `/spec-diff` (and referenced from `/spec-reviewed`):
      on wake the ENGINE picks (`spec-env review --claim-since <iso>`), taking
      only a pass that arrived inside the wait window, acting on nothing when
      none did and refusing when two did — this scoping is what replaces
      "never claims unasked"
- [x] Route the claimed verdict exactly as `/spec-reviewed` does today
      (`Commit` → commit skill · `Commit & Continue` → commit then
      `/spec-next`, stopping there · `changes` → work them, gate stays armed ·
      `discuss` → report and ask)
- [x] Doc sweep for the premise inversion: rewrite the "a device that reaches
      your page cannot reach your conversation" passages and the gate story in
      `packages/common/assets/rules/spec-planning.md`, the repo `CLAUDE.md`
      spec-workflow section, and the `spec-diff` / `spec-reviewed` skill
      rationale — the serve token is the credential, the wait window is the
      scope, `/spec-reviewed` is fallback and disambiguation
- [x] Show the gate on the page: the outcome log as history (a skip reads as a
      skip, with its reason), and fix `drawLog`, which currently maps every
      verdict but `changes` to "discussed" — including `commit` (carried over
      from phase 1)
- [x] Tests: `env-review-window.test.js` (the window, and every way it must
      act on nothing), `assets-review-gate.test.js` (which skill arms, which
      refuses, which must never do either), served-page review-state tests, and
      the prose guards that pinned the old invariant rewritten to pin what
      replaced it — `pnpm test` green (2441 passed)

## Notes

The wait must end the turn, not poll: the watch re-invokes the session when
the pending file changes. A verdict of `commit` acting unattended is accepted
risk — the commit is local and reversible, and the page URL carries the
48-bit token.

Two things grew beyond the plan, both in the overview Changelog:

- **`--claim-since` is an engine flag, not a skill instruction.** The plan had
  the skill claiming "the pass from this wait", which means the agent reads the
  store and chooses — and the rule that it must not choose then becomes a
  request. The window goes to the engine, which answers in three states and
  acts only on exactly one pass.
- **The served page now reads the notes sidecar.** It never did, so accepts
  vanished on every refresh there and no history line could appear — which made
  the gate undisplayable on the one surface a phone can reach. Read-only; the
  header comment that forbade it has been corrected rather than worked around.
