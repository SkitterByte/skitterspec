# Phase 1 — Outbound projection: title/description split, push-prep, states, fixture ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the building blocks of a *usable* mirror — hyphen-safe markdown
everywhere, a first-sentence `titleFromText` helper, and correct+validatable
project-state names — proven against a realistic spec fixture, **without changing
the task-item shape** (that lands with the new engine in Phase 2, so the existing
three-way compare stays green throughout this phase).

## Tasks

- [x] Add a realistic spec fixture under `packages/sync-core/test/fixtures/`
      (00-overview + phase files): hand-wrapped bullets, a multi-line `**Goal:**`,
      hyphenated compounds wrapped at the hyphen, `` `apps/**` ``-style globs
      inside code spans, a table, and a fenced code block. Use it in the tests below.
- [x] Fold the hyphen-join fix into the whole read/collapse path — a shared
      `collapseHyphenAware` used by `findTaskBlocks` and the `**Goal:**` capture,
      the inline hyphen check in `joinOpenSpans`, and `cleanLogicalLine`. Result:
      a compound wrapped at the hyphen (`state-entry-with-`⏎`assignment`) collapses
      to `state-entry-with-assignment` in task text, goals, push-prep, and the
      sanitiser. Port the hotfix's red tests.
- [x] Add `titleFromText(text, max=100)` (first sentence — guarding decimals /
      versions / `e.g.`/`i.e.`; fallback: first ~100 chars at a word boundary),
      exported and unit-tested (paragraph task, one-liner, decimal, `e.g.`).
      **Standalone** — wired into the item shape in Phase 2.
- [x] Correct the shipped `states` defaults to Linear **project** statuses in
      `packages/linear/src/config.js` and `linear.config.json.example`
      (`Backlog / Planned / In Progress / Completed / Canceled`), keeping the
      local-bucket keys. Update `bucketForState`/`canonicalRemoteStatus` mapping
      + tests so lifecycle buckets map to the correct project state.
- [x] Add a `validateStates(config, workspaceStates)` pure helper returning the
      configured names absent from the workspace (skill supplies the MCP list).
      Unit-test it; the loud-failure wiring lands in Phase 3.
- [x] Add/extend tests: `normalizeLocal` over the realistic fixture is hyphen-safe
      (tasks, goals, description); `titleFromText` cases; states mapping. Run
      `node --test` (see `.claude/rules/spec-planning.md`) — green before done.

## Notes

Everything here is additive/behaviour-preserving for the existing compare — the
item shape is untouched, so Phase 1 keeps all 452 baseline tests green while
adding the hyphen safety, `titleFromText`, and state fixes. `titleFromText` and
the new `{title,description}` projection are joined up in Phase 2. This phase
absorbs the standalone hyphen hotfix (`7.0.3` is dropped in favour of `8.0.0`).
