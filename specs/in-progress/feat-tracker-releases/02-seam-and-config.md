# Phase 2 — Release seam + config + Linear adapter ops ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a provider-neutral release contract, a validated `releases` config,
and Linear adapter ops that pass it, all proven by unit tests against the Phase 1
fixtures.

## Tasks

- [ ] Add `provider-kit/src/releases.js`: the optional op names, plus a
      `releaseSupport(adapter)` built on `missingOps` that answers
      supported / unsupported.
- [ ] Add `releaseFind` · `releaseCreate` · `releaseAttach` ·
      `releaseStage` · `releaseComplete` to the Linear API adapter. Notes and
      links go on create/update.
- [ ] Parse and validate `releases.keyEnv` and `releases.pipelines[]` in
      `linear/src/config.js`. Refuse duplicate tag prefixes, a prefix that is a
      prefix of another, and malformed env maps. An absent block is the opt-out.
- [ ] Resolve a tag to its pipeline by the longest matching `tagPrefix`, and
      treat no match as "not a tracked series" rather than an error.
- [ ] Surface the GraphQL error body on HTTP 400 in `makeClient` (it read as
      `HTTP 400 ""` in the spike). Map `Not allowed to access feature
      'releaseManagement'` to "Releases unavailable" and `Access denied` to
      "key lacks scope". Neither may read as an empty workspace.
- [ ] Stays-silent tests: a config with no `releases` block; a tag that matches
      no prefix.
- [ ] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.
