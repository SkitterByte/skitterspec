# Phase 6 — Dogfood in this repo ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the next `skitterspec@` tag push creates a Linear release holding its
tickets at `staged`, and `npm run approve` moves it to `published`.

## Tasks

- [ ] Create the three pipelines in Linear's UI (user) — `skitterspec@`,
      `skitterspec-linear@`, `skitterspec-jira@` — then re-run
      `/spec-linear-setup` to link them and write the config.
- [ ] Add the `release create` step to `release.yml` after staging succeeds,
      with `fetch-depth: 0`. The user adds the secret.
- [ ] `scripts/approve-release.cjs`: after a successful approve, complete the
      release (personal key) or print the dispatch to run (per Phase 1).
- [ ] Update RELEASING.md with the new step.
- [ ] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.
