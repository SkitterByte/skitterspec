---
github_identifier: "#302"
github_url: "https://github.com/SkitterByte/skitterspec/issues/302"
---

# Bug: bare `skitterspec spec-sync` is refused after #278

> **Type:** Bug
> **Name:** bug-base-forwards-provider-verbs
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/302
> **Area:** packages/common (bin/skitterspec.js, src/provider.js, src/cli.js)
> **Docs:** index

## Symptom

Reported from ereqs, on global `@skitterbyte/skitterspec` 23.24.0 and
`@skitterbyte/skitterspec-azure-boards` 3.2.0, with
`specs/.core/azure-boards.config.json` present:

```
$ skitterspec spec-sync ownership
skitterspec: unknown command: spec-sync — this is the base distribution, which does not ship it.
$ skitterspec-azure-boards spec-sync ref
spec-sync ref: no spec matches branch main
```

The shipped skills and seams call bare `skitterspec spec-sync` (75 times in
the azure-boards package alone). On the MIGRATION.md solo path (a global CLI,
`init --local`, no dependency), every tracker seam is lost, along with
`/spec-push`, `/spec-status`, `/spec-claim` and the `Refs:` trailer. All four
providers are affected.

## Root cause

#278 gave the `skitterspec` name to the base alone, and 582e9b14 made the
base load the configured provider's `register.js`. That covers registrations
only. The provider's own verbs live in its `commands.js`, which only the
provider's bin routes, so `packages/common/bin/skitterspec.js` falls through
to `run()`, and `unknownCommand` (`packages/common/src/cli.js:286`) refuses
`spec-sync`.

## Failing test (red)

`packages/common/test/base-bin-provider.test.js`, run with
`node --test packages/common/test/base-bin-provider.test.js`:

- `base bin: spec-sync answers as skitterspec-<p> where <p> is configured`,
  one per provider: `spec-sync ref no-such-spec` through the base bin gives
  the same status, stdout and stderr as through the provider's bin.
- No provider configured: still refused with the current message.
- Configured but not installed: the refusal names the package to install.
- A verb the base ships is never forwarded.

```
AssertionError: The input was expected to not match the regular expression /unknown command/.
  'skitterspec: unknown command: spec-sync — this is the base distribution, which does not ship it.\n'
```

## Fix

- [x] `forwardProviderCommand` in `src/provider.js`: for a verb the base does
      not ship (`PROVIDER_COMMANDS` in `cli.js`), run the configured
      provider's own bin, resolved the way its `register.js` is, and pass its
      exit status through
- [x] The base bin tries the forward before registering, so a forwarded verb
      runs with the provider's own registrations and no double warning
- [x] Configured but not installed: refuse, naming the package to install
- [x] Failing tests pass (GREEN); `pnpm test` shows no regressions
- [x] `docs/index.html`: the global-install paragraph says the provider's
      commands follow too; `verify index`

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `skitterspec spec-sync`, `skitterspec spec-sanitise` forward to the configured provider's bin |

## Changelog

- 2026-11-24 — Bug reproduced on all four providers; failing test added (red).
- 2026-11-24 — Chose forwarding over rewriting the skills' calls to provider
  bin names: one change in the base, and it also covers skill files that
  users have customised.
- 2026-11-24 — Fixed: the base bin forwards provider-only verbs to the
  configured provider's bin; test green. Two existing tests ran the base from
  this repo, which configures GitHub, so they now run outside any project.
