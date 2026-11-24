---
github_issue_id: "#300"
---

# Phase 5 — Skill wiring: the autonomous loop and endings ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-start` and `/spec-next` run a spec end to end when the mode
resolves to auto, stop on the agreed conditions, and take the chosen ending.

## Tasks

- [x] `/spec-start` and `/spec-next`: accept `--auto`, `--supervised`,
      `--then pause|push|pr`; resolve once via `run resolve`
- [x] `/spec-next`: autonomous loop — re-read spec and git, pre-flight stop
      checks, build, tests (fix up to `maxFixAttempts`), `review --report
      --snapshot`, `/commit`, `run phase`, next
- [x] Every phase, supervised too: pass the report rows to `review --report`
- [x] Stop conditions: red after N, `Blocked on:` / unmet `Waits on:`,
      manual steps, open decision — `run stop`, arm the gate, supervised
      banner; `Commit & Continue` resumes in the run's mode and ending
- [x] Endings: `pause` renders `--final`, arms, waits; `push` integrates
      with `--push`; `pr` hands to `/spec-complete` with the per-phase PR body
- [x] `/spec-diff`: route `complete`, `push`, `pr` verdicts from the final page
- [x] `/spec-complete` PR mode: body lists each phase with its commit
- [x] `/spec`: ask the `Run:` question when `auto` is configured, offering
      the config default
- [x] Push notification on finish or stop where the harness has one
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/project-conventions.md`) — green before
      the phase is done.
