---
linear_issue_id: "SKS-165"
---

# Phase 3 — Rename `spec-sync push` to `spec-sync plan` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the CLI verb that computes a plan is called `plan`, and the old name
fails with a message that names its replacement.

## Tasks

- [ ] Rename the subcommand in `packages/linear/src/cli-sync.js`: the dispatch
      `case`, the usage text, and every `spec-sync push:` message prefix
      (refusals included — there are several).
- [ ] Keep `push` recognised as a **retired name**: exit non-zero with
      `spec-sync push was renamed to spec-sync plan`, rather than falling through
      to the generic usage block, which would drop the migration hint.
- [ ] Update the callers: `/spec-push` and `/spec-sync` skills, the
      `spec-tracker-link` seam, and `packages/linear/assets/core/SETUP.md`.
- [ ] **Leave `fieldOwnership` values alone** — `assignee: "push"`,
      `description: "push"`, `workflowState: "push"` name a direction of
      ownership, not a subcommand (decision 8). A search-and-replace over
      `"push"` will break adopters' configs; do it by hand.
- [ ] Update the tests that drive the verb — `cli-push-state-gate`, `cli-apply`,
      `cli-adoption`, `cli-exit-codes`, `cli-deferred-phases`, `assets` and any
      other that names it.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

Two tests worth writing beyond the mechanical rename:

- **The retired name fires** — `spec-sync push` exits non-zero and names `plan`.
- **STAYS SILENT: config vocabulary is untouched** — a config with
  `fieldOwnership: { assignee: "push" }` still loads and still means what it
  meant. This is the assertion that catches the over-eager rename, and the one
  most likely to be skipped because the change "obviously" did not touch config.

`/spec-push` keeps its name deliberately: after this it runs `plan` then `apply`,
so it is the only one of the three that actually pushes anything.
