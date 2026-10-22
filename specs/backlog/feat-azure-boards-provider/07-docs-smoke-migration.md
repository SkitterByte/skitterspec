---
linear_issue_id: "SKS-424"
---

# Phase 7 — Docs, live smoke, ereqs migration path ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the provider is documented, smoke-tested live against the throwaway
org end to end, and ereqs has a written migration path off Linear — the last
blocker to cancelling the subscription is the client running it.

## Tasks

- [ ] `docs/azure-boards.html` + docs index links; config reference doc
      (`azure-boards.config.md`) finalised.
- [ ] Setup skill walk: interview to a valid `azure-boards.config.json`
      against the throwaway org (types, states, tags validated live).
- [ ] Live smoke on the throwaway org: link a spec, push phases, move states
      through the lifecycle, claim, intake-adopt a hand-filed item
      (original preserved as a comment), `release create/deployed/complete`
      dry-run then `--apply`.
- [ ] Migration doc for ereqs: install the dist, run setup, push open specs
      (backlog + in-progress link by ordinary push; complete/cancelled keep
      `linear_*` stamps), set `refs.foreignPatterns` to the Linear team key,
      swap CI release calls — ending at "Linear can be cancelled".
- [ ] First release: cut `skitterspec-azure-boards@1.0.0` via the normal tag
      push + `npm run approve` flow.
- [ ] Tests green: full workspace suite (`pnpm test`); smoke results recorded
      in this file's notes.
