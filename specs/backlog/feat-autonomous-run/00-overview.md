---
github_identifier: "#295"
github_url: "https://github.com/SkitterByte/skitterspec/issues/295"
---

# Autonomous runs: start to finish without stopping per phase

> **Type:** Feature
> **Name:** feat-autonomous-run
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/295
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** packages/common/src/env/review.js, packages/common/src/env/render.js, packages/common/src/env/serve.js, packages/common/src/env/config.js, packages/common/src/env/hooks.js, packages/common/src/init.js, packages/common/assets/skills/{spec,spec-start,spec-next,spec-diff,spec-complete}, packages/common/assets/rules/{spec-planning,spec-format,spec-reports}.md, specs/.core/env.config.md, docs
> **Stack:** worktree
> **Docs:** review, reference

## Summary

A spec can run from its first phase to its last without stopping for a
review at each one. Every phase still gets its review page, kept as a
snapshot you can open while the run carries on, and the run ends where you
choose: paused on one final page, pushed as a branch, or opened as a PR.

## Problem

Today every phase ends on its review page and the run waits for a verdict.
That is right when a person is steering, and wrong for "software factory"
work where the spec is groomed and the agent should just build it. There is
no way to say "run it all", no record of each phase's review once the next
phase overwrites the page, and the end-of-phase report table lives only in
the terminal, so its notes and follow-ups are lost to anyone reading the
page later.

## Acceptance criteria

- With `auto.default: "auto"` in `env.config.json`, `/spec-start <name>`
  builds every phase and commits each one without waiting for a verdict.
- `> **Run:** supervised` on a spec, or `--supervised` on the command,
  makes that run stop per phase as today; `--auto` overrides a supervised
  header or config.
- Each phase leaves a kept snapshot page that opens while later phases are
  still building, reachable from a run index page on the same server.
- Every review page, supervised or autonomous, shows that phase's report
  table (Built, Tests, Notes, Follow-ups).
- The final page lists every follow-up, bug and suggestion from every phase
  of the run in one place.
- `--then pause` ends on one final page that waits, offering Complete,
  Push/PR, Request changes and Discuss. `--then push` pushes the branch and
  ends. `--then pr` runs `/spec-complete`'s first (PR) run.
- A red phase after `auto.maxFixAttempts` tries, a `Blocked on:` or unmet
  epic wait, a phase with manual steps, or an open decision stops the run
  on that phase's page; `Commit & Continue` there resumes it autonomously.
- A finish or early stop sends a push notification where the harness has
  one.
- The final report says how many times the context compacted, and in which
  phases.

## Decisions

1. **Mode resolves by precedence: flag > spec header > config > supervised.**
   `--auto` / `--supervised` on `/spec-start` and `/spec-next`;
   `> **Run:** auto|supervised` on the spec; `auto.default` in
   `env.config.json`. Absent everywhere means supervised, today's behaviour.
   Rejected: a new `/spec-run` skill (a second build path to keep in step).
2. **The ending resolves the same way**: `--then pause|push|pr` over
   `auto.then`, default `pause`. Passing `push`/`pr`, or configuring it, is
   the push consent; nothing pushes in a run that did not name one.
3. **`pr` is `/spec-complete` run 1**: verify every phase, push, open a
   ready PR whose body lists each phase with its commit. `push` pushes the
   branch only and leaves the spec in flight. One commit (or commit group)
   per phase, so the PR's commit list reads as the phases. Rejected: a
   draft PR with the spec still in flight.
4. **Per phase: render, snapshot, commit, carry on.** The page is rendered
   as now, then kept as `phase-<n>` (read-only: accepts and notes allowed,
   no verdict buttons). No gate is armed per autonomous phase; the outcome
   log records `auto-committed` so "nobody pressed a verdict" is on the
   record rather than silent. Notes left on a snapshot mid-run are not acted
   on until the final page's Request changes. Rejected: arm-and-auto-skip
   (ceremony with the same effect).
5. **A run index page** on the review server lists each phase snapshot as it
   lands, so the run can be read at any point. Same token, same tiers.
6. **Every review page carries the phase's report table**, supervised runs
   included: the skill hands the block's rows to the engine
   (`--report <file>`), which stores them beside the notes sidecar and
   renders them. The diff still never passes through the model; the rows are
   what the model already wrote.
7. **The final page aggregates** every phase's `Follow-ups` and `Notes`, plus
   unresolved reviewer findings and notes left on snapshots, into one list,
   above the whole-branch diff and the index of phase snapshots.
8. **Stop conditions** route back to a supervised stop on that phase: red
   tests after `auto.maxFixAttempts` (default 3) fix attempts, `Blocked on:`
   or an unmet `Waits on:`, a phase with manual steps, and a decision the
   spec left open with more than one defensible answer. The stop arms the
   gate as a supervised phase would; `Commit & Continue` resumes the run in
   its original mode and ending.
9. **Reviewers are record-only**, as today: findings land on each snapshot
   and the final page, never gate, never acted on by the agent.
10. **In-session, compaction made safe and visible.** No tool lets the agent
    read its own context usage, so there is no "pause at N%". Each phase
    starts by re-reading the spec and git, so compaction loses nothing, and a
    `PreCompact` hook appends to the run record when a run is active (fails
    open otherwise). Rejected: a subagent per phase (a second build path).
11. **The run record** is `.spec-env/runs/<spec>.json` (gitignored): mode,
    ending, phases with commit and snapshot, stops, compactions. The run's
    end also writes one dated Changelog line on the spec.
12. **Notify on finish or stop** with the harness's push notification where
    one exists; silent otherwise. The block and banner follow as usual.

## Solution overview

`spec-env run resolve <spec> [--auto|--supervised] [--then …] --json` answers
the mode and ending once, at `/spec-start` or `/spec-next`, and opens the run
record. The skill then loops `/spec-next`'s build: pre-flight (stop
conditions) → build → tests (fix up to N) → `review --report <rows>
--snapshot` → `/commit` → `run phase <n> --commit <sha>` → next. At the last
phase it takes the ending: `pause` renders `review --final` (aggregate list,
whole-branch diff, phase index, buttons `complete · push · pr · changes ·
discuss`), arms the gate and waits; `push` integrates with a push; `pr` hands
to `/spec-complete`.

```jsonc
// env.config.json
"auto": { "default": "supervised", "then": "pause", "maxFixAttempts": 3 }
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `auto.default`, `auto.then`, `auto.maxFixAttempts` |
| Spec header | add | `> **Run:** auto \| supervised` |
| CLI command | add | `spec-env run <resolve\|phase\|stop\|compacted\|end\|status>` |
| CLI command | update | `spec-env review` +`--report <file>`, `--snapshot`, `--final` |
| Route/UI | add | run index page; phase snapshot pages; final page |
| Route/UI | update | every review page shows the phase report table |
| Business rule | add | verdicts `complete`, `push`, `pr` on the final page |
| Hook | add | `.claude/hooks/run-compact.cjs` (`PreCompact`), installed by init/update |
| Skill/rule | update | `/spec`, `/spec-start`, `/spec-next`, `/spec-diff`, `/spec-complete`; spec-planning, spec-format, spec-reports |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Mode resolution and the run record | ⬜ | [01-run-record.md](01-run-record.md) |
| 2 | Report table on every review page | ⬜ | [02-report-on-page.md](02-report-on-page.md) |
| 3 | Phase snapshots, run index, final page | ⬜ | [03-snapshots-and-final.md](03-snapshots-and-final.md) |
| 4 | Compaction hook | ⬜ | [04-compaction-hook.md](04-compaction-hook.md) |
| 5 | Skill wiring: the autonomous loop and endings | ⬜ | [05-skill-wiring.md](05-skill-wiring.md) |
| 6 | Docs and rules | ⬜ | [06-docs.md](06-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-24 — Spec created.
- 2026-11-24 — Added the report table on every review page and the final
  page's aggregate of follow-ups, bugs and suggestions (raised mid-grill).
