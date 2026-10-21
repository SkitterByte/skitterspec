# Phase 1 — Spike Linear's release API and linear-release ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** know exactly which GraphQL operations and key types releases need,
proven against this workspace, before any engine code depends on them.

## Tasks

- [x] Introspect the schema for release types and mutations: create, update,
      add issue, stage change, complete, notes, links, lookup by
      pipeline + version, and pipeline + stage listing.
- [x] Try each one against a throwaway pipeline. Record which key works: a
      personal API key, a pipeline access key, or both.
- [x] Check whether the API can create pipelines (this informs Decision 9 only).
- [x] Run `linear-release sync --dry-run` on this repo. Does it read the
      `Refs:` trailer in the commit body, and what would it attach compared with
      `spec-sync released`? Record the verdict against Decision 1.
- [x] Write the findings into this file's Notes and capture the responses as test
      fixtures. Close the Open question and amend Decision 12 if the key answer
      changes it.
- [x] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The release mutations were marked alpha at writing. Pin what was observed, with
the date.

### Findings — 2026-10-21 (introspection, personal key)

- **Both key types have a full set of operations.** Personal key: `releaseCreate`,
  `releaseUpdate(id)`, `releaseComplete`, `releaseUpdateByPipeline`,
  `releaseSync`, `issueToReleaseCreate`, `releaseNoteCreate`,
  `releasePipelineCreate`, `releaseStageCreate`. Pipeline access key:
  `releaseSyncByAccessKey`, `releaseCompleteByAccessKey`,
  `releaseUpdateByPipelineByAccessKey`, `latestReleaseByAccessKey`.
- **`releaseSync`** takes an explicit `issueReferences: [{identifier, commitSha}]`,
  plus `version`, `commitSha!`, `links`, `documents` (upserted by title),
  `releaseNotes` and `repository`. Continuous pipelines get a new completed
  release. Scheduled pipelines "find or create a started release and accumulate
  issues into it". Whether that find is keyed by `version` is **untested**.
- **`releaseCreate`** takes `{name!, pipelineId!, version, commitSha, stageId}`.
  Without a stage it defaults to the first completed stage (continuous) or the
  first started stage (scheduled).
- **`issueToReleaseCreate`** takes `issueId`, which accepts an identifier like
  `SKS-41` directly, and `releaseId`.
- **`releaseUpdateByPipeline`** takes `{pipelineId!, version, stage}`. The stage
  is matched by name, exactly first, then case-insensitively.
  **`releaseComplete`** takes `{pipelineId!, version}`. Without a version, both
  act on the latest started release.
- **Lookup:** `releases(filter: ReleaseFilter)` filters on `version`, `pipeline`
  and `stage`. That is the find-before-create for Decision 4.
- **Stage types** are `planned · started · completed · canceled`. Pipeline types
  are `continuous · scheduled`. A pipeline also carries `includePathPatterns` and
  `rolloverIssuesOnCompletion` (default true).
- **Pipelines can be created through the API** (`releasePipelineCreate`,
  `releaseStageCreate`), but Decision 9 still stands: a pipeline is the PM's
  surface.
- **Feature gate:** reads succeed and return `[]`, and the first write was
  refused with `Not allowed to access feature 'releaseManagement'` while Releases
  was not enabled for the workspace. The engine must treat that error as
  "Releases unavailable" and degrade to the ladder in setup. It must never treat
  it as an empty workspace.

### Live results — 2026-10-21 (throwaway scheduled pipeline, since deleted)

Fixtures: `packages/linear/test/fixtures/releases.json`, pinned by
`releases-fixtures.test.js`.

- **Creating a pipeline needs the key's Admin scope.** Without it Linear
  answers `Access denied`. Release writes then worked with the same personal key.
  It is **not** proven that a Write-only key can sync releases, so phase 5's
  doctor should report a scope refusal as such.
- **`releaseSync` keeps one release per `version` on a scheduled pipeline.** Two
  versions gave two releases, and re-syncing a version returned the same id.
  That makes it the create-or-update call, idempotent on the server.
- **An unresolvable ref is dropped silently.** The `SKS-41` lookup returns
  `Entity not found`, yet the sync answered `success: true` and attached
  nothing. So phase 3 must read the release's issues back and report every sent
  ref that did not attach.
- **Attaching never moves workflow state.** SKS-401 stayed `In Progress`. One
  issue can sit in several releases at once.
- **A new release lands on the first `started` stage by position** ("In
  Progress", position 0), not on a custom `Staged` stage at position 1. So the
  initial stage must be passed explicitly. `releaseUpdateByPipeline` matched
  `staged` → `Staged` case-insensitively. An unknown stage gives `stage not found`
  and an unknown version gives `not found`.
- **`releaseComplete` is idempotent.** Completing twice kept the first
  `completedAt`, and a later sync of a completed version changes nothing.
  Completing accepts `links` and `releaseNotes`; links read back as
  `links { nodes { url label } }`.
- **Lookup:** `releases(filter: { version: { eq }, pipeline: { id: { eq } } })`
  works with variables typed `String!`/`ID!`, and a miss is `nodes: []`.
- **Our API client swallowed the body on HTTP 400**, so a malformed query read
  as `HTTP 400 ""`. Phase 2 fixes that, since a release query typo would
  otherwise be undiagnosable from CI logs.
- **`linear-release` verdict: not adopted (Decision 1 stands).** It reads the
  whole message line by line and counts `ref`/`refs` as a contributing word
  (`src/extractors.ts`), so it **would** find our `Refs:` trailer. It does not
  skip fenced, quoted or indented lines, does not exclude foreign or unlinked
  refs, also extracts IDs from branch names, needs a pipeline access key, and
  takes its baseline from Linear's latest release rather than the tag series.
  `releaseSync` with our own `issueReferences` gets the same Linear-side result
  with one definition of what shipped.
