---
github_issue_id: "#204"
---

# Phase 2 — `/spec-todo`: where you left off ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec todo` and the `/spec-todo` skill answer the morning
question: where each project was left on the last active day, and what's
ahead. Proven by engine tests over fixture repos and transcripts.

## Tasks

- [ ] `tada/todo.js`:
      - `lastActiveDay(now, facts)` returns the most recent day before today
        with a session or commit in scope, looking back at most 14 days, or
        `null`;
      - the per-project fold returns the left-off line per spec (last move or
        commit), its in-flight line, and today's activity so far.
- [ ] Read each project's waiting review passes and armed gates from its
      `.spec-env/`, read-only, through the existing review readers. A
      project without one is cannot-tell and prints nothing.
- [ ] `cli.js`: add `skitterspec todo`, which takes the same scope flags as
      `tada` plus `--page`/`--summary`. The text form mirrors `tada`: a
      `todo:` heading naming the left-off day, `(here)` on the home project,
      `blocked:` lines for waiting verdicts and armed gates. With no active
      day it prints `nothing in the last 14 days`.
- [ ] Reuse the tada page and serve route for `--page`, headed "To-do".
- [ ] Add the `/spec-todo` skill to `packages/common/assets/skills/`, with
      the same shape and rules as `/spec-tada` (read-only, text form, never
      publish). It gives the recap per project and a three-line
      **Left off / Today / Blockers** standup. `Next` is the home project's
      first action.
- [ ] Register the skill wherever skills are composed, counted and listed.
- [ ] Tests:
      - `lastActiveDay` across a weekend, a gap of more than 14 days, and
        activity today only;
      - blockers read from fixture `.spec-env/` files;
      - a stays-silent test that a project with no `.spec-env` adds no
        `blocked:` line;
      - CLI text output.
      Run `pnpm test`, which must be green.
