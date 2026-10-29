---
github_issue_id: "#26"
---

# Phase 2 — Release seam + config + Linear adapter ops ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a provider-neutral release contract, a validated `release.pipelines` config,
and Linear adapter ops that pass it, all proven by unit tests against the Phase 1
fixtures.

## Tasks

- [x] Add `provider-kit/src/releases.js`: the optional op names, plus a
      `releaseSupport(adapter)` built on `missingOps` that answers
      supported / unsupported.
- [x] Add `releaseFind` · `releaseSync` · `releaseStage` · `releaseComplete`
      to the Linear API adapter (`releaseSync` is create-or-update and attaches
      in one call, per phase 1). Notes and links go on sync and complete.
- [x] Parse and validate `release.pipelines[]` (`tagPrefix`, `pipelineId`,
      ordered `envs: [{key, stage}]`, optional `initialEnv`) via a kit merge
      helper, wired into `linear/src/config.js`. Refuse duplicate tag prefixes, a prefix that is a
      prefix of another, and malformed env maps. An absent block is the opt-out.
- [x] Resolve a tag to its pipeline by the longest matching `tagPrefix`, and
      treat no match as "not a tracked series" rather than an error.
- [x] Surface the GraphQL error body on HTTP 400 in `makeClient` (it read as
      `HTTP 400 ""` in the spike). Map `Not allowed to access feature
      'releaseManagement'` to "Releases unavailable" and `Access denied` to
      "key lacks scope". Neither may read as an empty workspace.
- [x] Stays-silent tests: a config with no pipelines; a tag that matches
      no prefix.
- [x] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

- `provider-kit/src/releases.js` holds the contract (`RELEASE_OPS`,
  `releaseSupport`) and the pure lookups: `pipelineForTag`,
  `pipelineForPrefix`, `envFor`, and `unattachedRefs`. `unattachedRefs` answers
  `null`, meaning cannot tell, when a release came back without its issues.
- `releaseRefusalKind` (in `linear/src/api.js`) maps refusals to
  `unavailable` or `scope`; anything else is `null`, meaning relay the message.
- Release issues are read back with `first: 250`. A larger release would report
  the overflow as unattached, which is noisy but never silent.
