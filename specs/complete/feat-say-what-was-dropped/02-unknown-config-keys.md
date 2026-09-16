---
linear_issue_id: "SKS-279"
---

# Phase 2 — An unknown config key says so ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a key in `env.config.json` that `mergeConfig` does not read is
reported once, on stderr, by every `spec-env` command — advisory, exit 0, and
silent on every healthy config.

## Tasks

- [x] Use `DEFAULT_CONFIG` itself as the known-key shape in
      `packages/common/src/env/config.js`, rather than declaring a second list
      beside it. Every key `mergeConfig` reads is necessarily a key of the
      defaults — a key with no default has nothing to merge onto — so the
      defaults already *are* the contract. (Planned as a separate `KNOWN_KEYS`
      — see the Changelog for why it moved.)
- [x] Add `collectUnknownKeys(parsed)` returning dotted paths (`open`,
      `review.readr`). It descends only where the **default** is a plain object
      — never into array elements, so `setup`, `dev`, `spec.companionPaths`,
      `live.migrations` and `hotfix.targets` contents are left alone.
- [x] Return `unknown` from `loadEnvConfig` alongside `config` and `present`.
      An absent file yields `[]`; malformed JSON keeps throwing, as it does now.
- [x] Print the advisory in the `spec-env` dispatcher
      (`packages/common/src/cli.js`, right after the `loadEnvConfig` call and the
      `present` guard): one line per unknown key on **stderr**, e.g.
      `spec-env: env.config.json — unknown key "review.readr" is ignored.`
      Exit status is unchanged.
- [x] Add `packages/common/test/env-unknown-keys.test.js`:
      **positive** — a top-level stray and a nested typo are both reported, the
      command still runs, and the exit status is 0.
- [x] Add the stays-silent tests (negative-checks rule 3): this repo's own
      `specs/.core/env.config.json` reports nothing; the shipped
      `specs/.core/env.config.json.example` reports nothing — that one is the
      drift guard that keeps `KNOWN_KEYS` honest as keys are added; an absent
      config reports nothing; an empty `{}` reports nothing.
- [x] Assert the advisory is on stderr and never reaches stdout — run a
      `--json` subcommand with an unknown key present and check stdout carries
      no advisory line. (`spec-env status --json` prints prose rather than JSON
      when there are no provisioned specs, so parsing stdout would have tested
      that quirk rather than this behaviour.)
- [x] Document the advisory in `packages/common/assets/core/env.config.md`,
      including what it deliberately does not report. *(Surfaced during the
      build: a new user-visible line with no entry in the field docs is the
      same silence this phase is about.)*
- [x] Remove the dead `linkLinear` key from this repo's own
      `specs/.core/env.config.json`. *(Surfaced during the build — the check
      found it on its first run; see the Changelog.)*
- [x] Run `pnpm test` from the repo root — green before the phase is done.

## Notes

A known key whose *value* was rejected — `mode: "Checkout"`,
`review.reader: "remote "`, a non-boolean `review.required` — is deliberately
out of scope. Each already falls through to a conservative default that carries
a comment explaining why, and widening this check to cover them is a separate
decision about how loud a rejected value should be.

The advisory fires on every invocation, including inside loops. That is
intended: an unknown key is a config error, not a transient state, and it stops
the moment the key is fixed or removed.
