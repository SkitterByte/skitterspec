---
linear_issue_id: "SKS-372"
---

# Phase 2 — Extract provider-kit, rewire linear ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the ~1,600 generic lines in `packages/linear` move to a new private
`packages/provider-kit`; linear consumes it with identical behaviour and a
green suite.

## Tasks

- [x] Scaffold `packages/provider-kit` (private, `main: index.js`, node --test),
      pinned in root devDependencies like the linear provider.
- [x] Hoist the config machinery: `isObject`/`assign`/`stringList`/
      `mergeFieldOwnership`/`mergeKeyedFields`/`mergeConfig` and a
      `makeConfigLoader({file, defaults, envKey})` factory
      (`linear/src/config.js:218-564`); linear keeps only its defaults,
      file name, and state vocabulary.
- [x] Hoist the credentials store (`credentials.js` minus the `lin_api_` regex
      and prompt copy) and introduce schema v2: `{version: 2, providers:
      {linear: {teams: …}, jira: {sites: …}}}`; a v1 file is read as
      `providers.linear` without rewriting it, and the first write migrates.
      Values may be a string key or an object (Jira's email+token pair).
- [x] Hoist identity (3-tier store→viewer→unknown), the doctor framework
      (`STATES`/`row`/`runChecks`, ~60 ln), and released.js's generic parts
      (`refsInBody`, `ticketsInRange`, `onlyIgnoredPaths`, `stageOrderWarning`)
      parameterised by identifier regex + key prefix.
- [x] Hoist the CLI plumbing from `cli-sync.js`: spec resolution/listing
      (`:89-213`, keyed by the phase-1 `fields`), reporting helpers, the
      transport-resolution expression (repeated 9×), the file-handoff readers
      (`--workspace-states`/`--stored`/`--mcp`/`--text`), the arg parser with
      unknown-flag refusal (`:3929-4046`), credentials subcommands + hidden
      prompt (`:3460-3596,3888-3927`), and the
      plan→apply→stamp-as-you-go→verify→record orchestration
      (`applyOneSpecInner :2604-2796`) with adapter + `stateResolver` injected.
- [x] Hoist the HTTP retry loop (`api.js:195-260` — 401/403 classification,
      429 Retry-After, capped backoff) as a generic `makeHttpClient`; linear's
      GraphQL layer wraps it.
- [x] Rewire `packages/linear` onto the kit; delete the hoisted originals; the
      full linear test suite passes unmodified (tests are the behaviour spec).
- [x] Add the kit to `build-dist.js` `VENDOR`
      (`@skitterbyte/skitterspec-provider-kit/src → src/vendor/provider-kit`)
      and confirm `guardNoWorkspaceRequires` passes on both existing dists.
- [x] Kit gets its own unit tests for the store migration (v1 read, first-write
      upgrade, 0600/0700 modes preserved) and the transport resolver.
- [x] Full workspace suite green.

## Notes

The op-contract test pattern (`linear/test/api.test.js:143-150` — "API adapter
may add ops, never lack one") moves to the kit as a reusable assertion both
providers run.

## Notes (built)

- Hoisted whole: credentials store (schema v2 + migration + 0600/0700 guards),
  identity resolution, doctor framework, released.js (linear keeps a re-export
  shim), config merge machinery (`makeMergeHelpers` bound per provider), HTTP
  rate-limit retry, transport resolution (replaced 9 inline copies), spec
  resolution/listing/lint reporting, hidden-prompt + stdin helpers, and a fresh
  table-driven flag parser + adapter op-contract helper for the next provider.
- **Schema deviation:** a v1 store stays v1 under the legacy owner's writes
  (older CLIs keep reading it, and the linear tests pin the raw shape); the
  FIRST write by a second provider is what migrates to v2 — the moment sharing
  actually begins. Kit tests pin the migration.
- **Deferred to phase 4, deliberately:** the apply orchestration and the
  credentials command layer stay in `packages/linear` until jira exists as the
  second consumer — parameterising them against one consumer would fix the
  hook shape before anything validates it. Linear's inline arg parser also
  stays (proven behaviour); the kit parser is for new providers.
- `makeConfigLoader` became `makeMergeHelpers`: the loader shell (read, parse,
  attach runtime) is ~20 provider-shaped lines not worth a factory.
- Release inputs updated now rather than in phase 5: `packages/provider-kit`
  joined skitterspec-linear's `TARBALL_INPUTS` and the release-notes `FEEDS`
  (with the in-step guard test), so a refactor-only linear release attributes
  correctly.
