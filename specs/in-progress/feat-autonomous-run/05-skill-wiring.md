---
github_issue_id: "#300"
---

# Phase 5 — Skill wiring: the autonomous loop and endings ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-start` and `/spec-next` run a spec end to end when the mode
resolves to auto, stop on the agreed conditions, and take the chosen ending.

## Tasks

- [ ] `/spec-start` and `/spec-next`: accept `--auto`, `--supervised`,
      `--then pause|push|pr`; resolve once via `run resolve`
- [ ] `/spec-next`: autonomous loop — re-read spec and git, pre-flight stop
      checks, build, tests (fix up to `maxFixAttempts`), `review --report
      --snapshot`, `/commit`, `run phase`, next
- [ ] Every phase, supervised too: pass the report rows to `review --report`
- [ ] Stop conditions: red after N, `Blocked on:` / unmet `Waits on:`,
      manual steps, open decision — `run stop`, arm the gate, supervised
      banner; `Commit & Continue` resumes in the run's mode and ending
- [ ] Endings: `pause` renders `--final`, arms, waits; `push` integrates
      with `--push`; `pr` hands to `/spec-complete` with the per-phase PR body
- [ ] `/spec-diff`: route `complete`, `push`, `pr` verdicts from the final page
- [ ] `/spec-complete` PR mode: body lists each phase with its commit
- [ ] `/spec`: ask the `Run:` question when `auto` is configured, offering
      the config default
- [ ] Push notification on finish or stop where the harness has one
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/project-conventions.md`) — green before
      the phase is done.
