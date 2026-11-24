---
github_issue_id: "#296"
---

# Phase 1 — Mode resolution and the run record ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine answers "is this run autonomous, and how does it end?"
and keeps a record of the run; proven by unit tests over every precedence
combination.

## Tasks

- [x] Add `auto` to config loading (`default`, `then`, `maxFixAttempts`),
      with an unrecognised value falling back to the default
- [x] Parse `> **Run:** auto|supervised` from a spec header; anything else
      is cannot-tell and ignored
- [x] Add `spec-env run resolve <spec> [--auto|--supervised] [--then …] [--json]`:
      precedence flag > header > config > supervised, reporting which source won
- [x] Add the run record `.spec-env/runs/<spec>.json` and the verbs
      `run phase <n> --commit <sha> [--snapshot <path>]`, `run stop --reason <text>`,
      `run compacted`, `run end`, `run status [--json]`
- [x] Record `auto-committed` in the review outcome log for an autonomous phase
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/project-conventions.md`) — green before
      the phase is done.
