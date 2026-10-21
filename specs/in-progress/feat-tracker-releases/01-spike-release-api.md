# Phase 1 — Spike Linear's release API and linear-release ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** know exactly which GraphQL operations and key types releases need,
proven against this workspace, before any engine code depends on them.

## Tasks

- [ ] Introspect the schema for release types and mutations: create, update,
      add issue, stage change, complete, notes, links, lookup by
      pipeline + version, and pipeline + stage listing.
- [ ] Try each one against a throwaway pipeline. Record which key works: a
      personal API key, a pipeline access key, or both.
- [ ] Check whether the API can create pipelines (this informs Decision 9 only).
- [ ] Run `linear-release sync --dry-run` on this repo. Does it read the
      `Refs:` trailer in the commit body, and what would it attach compared with
      `spec-sync released`? Record the verdict against Decision 1.
- [ ] Write the findings into this file's Notes and capture the responses as test
      fixtures. Close the Open question and amend Decision 12 if the key answer
      changes it.
- [ ] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The release mutations were marked alpha at writing. Pin what was observed, with
the date.
