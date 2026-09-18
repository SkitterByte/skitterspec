---
linear_issue_id: "SKS-352"
---

# Phase 3 — Stop writing the docs in npm ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the documentation a new project reads does not imply the project is
written in JavaScript.

## Tasks

- [x] Rewrite the fill-in placeholders in
      `packages/common/assets/rules/spec-planning.md` ("Project conventions") so
      the examples are not all npm — the instruction is already
      stack-neutral, the examples are not.
- [x] Do the same for the `Tests` row examples in `spec-planning.md` and
      `packages/common/assets/rules/spec-reports.md`, which read `npm test`
      in all four worked examples.
- [x] Note in `packages/common/assets/core/env.config.md` that `seedFiles`
      defaults to `[".env"]` as an illustration rather than an expectation, and
      name a non-JS equivalent.
- [x] Add the global-install path to the README's install section — it is the
      only viable route in a project with no `package.json`, and nothing
      currently documents it.
- [x] Re-run the asset tests (`assets-fences.test.js` and the rule/skill
      consistency tests) so the doc edits do not break the shipped-asset
      contracts, plus the project's typecheck and test commands.

## Notes

Documentation-only, but it is the phase a reader of another stack meets first —
the engine was already agnostic and the docs were what said otherwise.

`assets-fences.test.js` matches a `RUNNERS` regex over fenced blocks that
includes `npm`/`pnpm`/`npx`; check whether any edit here needs that list
adjusted rather than assuming it is inert.
