---
name: spec-review
description: Re-validate an existing spec against the current codebase — detect drift (renamed/removed files, changed APIs, tasks already done in code, stale decisions), grill where a decision is needed, and update the spec so it's relevant again. Targets a spec by name (arg) or the spec in context. Use when the user says "/spec-review", "is this spec still accurate", "this spec has gone stale", or before picking up an old backlog spec.
---

# /spec-review — bring a spec back in sync with the codebase

Specs rot: the code moves on while a spec sits in the backlog or pauses
mid-build. This skill re-validates a spec against the **current** code and
rewrites the stale parts so it's safe to act on. It plans only — it does not
implement anything (that's `/spec-go`).

## 1. Identify the target spec

- Use the name/path argument if given, else the spec **in context**. If unclear,
  ask which spec.
- Locate the spec folder under `specs/` (any bucket). Entry point is its
  `00-overview.md` (legacy specs may be a bare `<name>.md`).

## 2. Validate against the codebase — evidence first

Read the spec, then check every claim it makes against the real code. Don't
trust the spec's own wording — verify:

- **Referenced things still exist.** Grep/read for each `file:line`, module,
  function, route, model, type, or symbol the spec names. Flag anything renamed,
  moved, or deleted.
- **Tasks already done.** For each `- [ ]`, check whether the code already
  implements it (it may have landed via other work). Tick `- [x]` what's done.
- **Decisions still valid.** Re-check each `## Decisions` entry against the
  current architecture and `.claude/rules/*.md`. Flag any that now conflict with
  how the codebase actually works (a changed convention, a superseded approach).
- **New constraints.** Note rules/patterns introduced since the spec was written
  that it must now honour (e.g. a new required field, a new error type, a new
  pattern the rest of the code now follows).
- **Backward compatibility.** Re-confirm the planned API/schema changes are still
  additive/safe given the current code (see the project's compatibility rules).

## 3. Grill only where a decision is needed

Where the drift forces a choice (the old approach no longer fits, a referenced
thing is gone, scope is now ambiguous), grill the user like `/spec` Phase A —
**one question at a time, with a recommended answer** — but scoped tightly to
the drift. Don't re-litigate decisions that still hold. If you can resolve it by
reading the code, do that instead of asking.

## 4. Update the spec

- Rewrite stale **Decisions**, **Solution overview**, and **tasks** so they match
  the current code and the resolved questions. Add/remove tasks and phases as
  needed; **preserve completed `[x]` history**.
- Tick tasks already satisfied by the code; re-open `## Open questions` for
  anything still undecided.
- Add a dated **Changelog** entry summarising the review (e.g. `- <date> —
  Reviewed vs codebase: retargeted Phase 2 onto X, dropped Y (removed), ticked Z
  (already done)`).
- **Status:** if drift is minor, leave status as-is. If a `Ready` spec needs real
  re-grooming, knock it back to `Draft` (set `> **Status:** Draft`, append a
  **State log** row, and reset its row in `specs/backlog/00-index.md` to `Draft`).

## 5. Report

Summarise the drift found, what you changed, any questions still open, and
whether the spec is now safe to `/spec-go` (or needs `/spec-ready` again). Do
**not** `git commit` unless the user asks.
