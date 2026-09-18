---
linear_issue_id: "SKS-348"
---

# Phase 3 — A typed exit from the gate ✅

> **Status:** Done

**Goal.** The gate's exit is one command a person types, not a CLI incantation
relayed to Claude.

## Tasks

- [x] Add `assets/commands/spec-skip.md` to the shipped assets — a
      **command**, `disable-model-invocation`, like `/spec-connect` and
      `/spec-live`: it pre-executes `skitterspec spec-env review skip "<reason>"`
      and relays the output.
- [x] **It refuses with no reason.** The engine already did; the command
      relays that rather than softening it. `/spec-skip` bare prints what the reason is
      for and exits without clearing anything. The reason is the whole
      difference between a decision and an oversight.
- [x] The hook's refusal names `/spec-skip "<reason>"` and `/spec-reviewed`,
      and hands all three exits to the operator rather than choosing one
      (`packages/common/assets/hooks/review-gate.cjs`).
- [x] **The engine's own `armed` line keeps the CLI form** — decided during the
      build, against the task as first written. `spec-env review gate` is a
      terminal surface usable with no harness at all, and a slash command
      printed there names something that does not exist. The hook's refusal
      carries both, since it quotes the engine and then adds its own line.
- [x] `init`/`update` install the new command (discovered from
      `assets/commands/`, so shipping the file is the whole install); it is listed in the skill table
      in `assets/rules/spec-planning.md` alongside the other user-only commands,
      with the reason it is user-only (a guard aimed at Claude is not Claude's to
      lift — the same line `/allow-main` draws).
- [x] Sync into the two shipping packages (`npm run build`).
- [x] Tests: the command asset exists and is model-disabled; the hook's deny
      text names it; a bare skip still refuses.
- [x] Full suite + build green.

## Notes

**Rejected: a reasonless `--force`.** It was the first thing asked for, and it
reopens exactly what the reason requirement closed — a silent skip is
indistinguishable from nobody having looked. `spec-planning.md` is explicit:
`none: additive, nothing to revert` is a decision a reviewer can argue with,
silence is an oversight.

**Rejected: `--force` on `/commit`.** `/commit` belongs to skittership, and
skitterspec deliberately neither vendors nor edits it — which is precisely why
the gate is enforced by a hook rather than by editing that skill.

**The gate itself does not move.** This phase changes how the exit is *reached*,
not what discharges it: a committing verdict or a recorded skip, and nothing
else.
