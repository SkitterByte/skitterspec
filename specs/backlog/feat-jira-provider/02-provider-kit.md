---
linear_issue_id: "SKS-372"
---

# Phase 2 — Extract provider-kit, rewire linear ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the ~1,600 generic lines in `packages/linear` move to a new private
`packages/provider-kit`; linear consumes it with identical behaviour and a
green suite.

## Tasks

- [ ] Scaffold `packages/provider-kit` (private, `main: index.js`, node --test),
      pinned in root devDependencies like the linear provider.
- [ ] Hoist the config machinery: `isObject`/`assign`/`stringList`/
      `mergeFieldOwnership`/`mergeKeyedFields`/`mergeConfig` and a
      `makeConfigLoader({file, defaults, envKey})` factory
      (`linear/src/config.js:218-564`); linear keeps only its defaults,
      file name, and state vocabulary.
- [ ] Hoist the credentials store (`credentials.js` minus the `lin_api_` regex
      and prompt copy) and introduce schema v2: `{version: 2, providers:
      {linear: {teams: …}, jira: {sites: …}}}`; a v1 file is read as
      `providers.linear` without rewriting it, and the first write migrates.
      Values may be a string key or an object (Jira's email+token pair).
- [ ] Hoist identity (3-tier store→viewer→unknown), the doctor framework
      (`STATES`/`row`/`runChecks`, ~60 ln), and released.js's generic parts
      (`refsInBody`, `ticketsInRange`, `onlyIgnoredPaths`, `stageOrderWarning`)
      parameterised by identifier regex + key prefix.
- [ ] Hoist the CLI plumbing from `cli-sync.js`: spec resolution/listing
      (`:89-213`, keyed by the phase-1 `fields`), reporting helpers, the
      transport-resolution expression (repeated 9×), the file-handoff readers
      (`--workspace-states`/`--stored`/`--mcp`/`--text`), the arg parser with
      unknown-flag refusal (`:3929-4046`), credentials subcommands + hidden
      prompt (`:3460-3596,3888-3927`), and the
      plan→apply→stamp-as-you-go→verify→record orchestration
      (`applyOneSpecInner :2604-2796`) with adapter + `stateResolver` injected.
- [ ] Hoist the HTTP retry loop (`api.js:195-260` — 401/403 classification,
      429 Retry-After, capped backoff) as a generic `makeHttpClient`; linear's
      GraphQL layer wraps it.
- [ ] Rewire `packages/linear` onto the kit; delete the hoisted originals; the
      full linear test suite passes unmodified (tests are the behaviour spec).
- [ ] Add the kit to `build-dist.js` `VENDOR`
      (`@skitterbyte/skitterspec-provider-kit/src → src/vendor/provider-kit`)
      and confirm `guardNoWorkspaceRequires` passes on both existing dists.
- [ ] Kit gets its own unit tests for the store migration (v1 read, first-write
      upgrade, 0600/0700 modes preserved) and the transport resolver.
- [ ] Full workspace suite green.

## Notes

The op-contract test pattern (`linear/test/api.test.js:143-150` — "API adapter
may add ops, never lack one") moves to the kit as a reusable assertion both
providers run.
