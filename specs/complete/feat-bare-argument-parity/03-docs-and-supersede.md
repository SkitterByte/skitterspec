---
linear_issue_id: "SKS-147"
---

# Phase 3 — documentation, and the superseded decision ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** every shipped surface describes one rule for the bare form, and the
decision this spec reverses points forward to the spec that reversed it.

## Tasks

- [x] Update the two command files' frontmatter —
      `packages/common/assets/commands/spec-live.md` and `spec-connect.md`:
      `description` and `argument-hint` both currently document the old bare
      meanings. `spec-live.md` says "a bare `take` takes the spec you are on",
      which is precisely the sentence this spec exists to delete.
- [x] Update `packages/common/assets/rules/spec-planning.md`: the live-overlay
      paragraph, and anywhere the `spec-env` zero-arg convention is stated as
      having exceptions. The sentence "omit the spec name and it uses the
      worktree you are standing in" becomes true without qualification — say so.
- [x] Update `docs/index.html`: the `spec-env connect` and `spec-env live` rows
      in the engine table, and the bare-argument note beneath it that currently
      calls out the two exceptions.
- [x] Search the shipped assets for the old wording rather than trusting this
      list — `connect disconnects`, `= main`, `bare take`, `keep their own
      meaning`. The usage block inside `specEnv()` in `cli.js` carries a NOTE
      spelling out both exceptions, and it is not prose anyone greps for.
- [x] Add a dated one-line entry to the **Changelog** of
      `specs/complete/feat-script-only-commands/00-overview.md` pointing at this
      spec. **Add, never edit** — Decision 8's text stays exactly as written,
      because it was correct about the risk it was guarding and the record of
      why it existed is worth more than tidiness.
- [x] Run `node --test scripts/docs-claims.test.js` and the prose guards early
      rather than at the end — a verb list or a quoted sample going stale is the
      failure mode this repo has had most often.
- [x] Run `pnpm test` at the repo root — the docs guards live there, not in a
      package — green before the phase is done.

## Notes

Phases 1 and 2 are independently shippable and this one is not: it documents both
of them. If only one of the two lands, this phase's scope shrinks to that one —
it must not describe a rule the engine only half implements.
