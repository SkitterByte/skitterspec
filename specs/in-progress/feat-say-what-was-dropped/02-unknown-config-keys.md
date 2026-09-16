---
linear_issue_id: "SKS-279"
---

# Phase 2 — An unknown config key says so ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a key in `env.config.json` that `mergeConfig` does not read is
reported once, on stderr, by every `spec-env` command — advisory, exit 0, and
silent on every healthy config.

## Tasks

- [ ] Declare `KNOWN_KEYS` in `packages/common/src/env/config.js`: the nested
      shape naming every key `mergeConfig` reads — top level plus `worktree`,
      `docker`, `proxy`, `branch`, `guards`, `teardown`, `review`, `spec`,
      `live`, `hotfix`, and the `seedFiles` object form.
- [ ] Add `collectUnknownKeys(parsed)` returning dotted paths (`open`,
      `review.readr`). It descends only where `KNOWN_KEYS` declares an object —
      never into array elements, so `setup`, `dev`, `spec.companionPaths`,
      `live.migrations` and `hotfix.targets` contents are left alone.
- [ ] Return `unknown` from `loadEnvConfig` alongside `config` and `present`.
      An absent file yields `[]`; malformed JSON keeps throwing, as it does now.
- [ ] Print the advisory in the `spec-env` dispatcher
      (`packages/common/src/cli.js`, right after the `loadEnvConfig` call and the
      `present` guard): one line per unknown key on **stderr**, e.g.
      `spec-env: env.config.json — unknown key "review.readr" is ignored.`
      Exit status is unchanged.
- [ ] Add `packages/common/test/env-unknown-keys.test.js`:
      **positive** — a top-level stray and a nested typo are both reported, the
      command still runs, and the exit status is 0.
- [ ] Add the stays-silent tests (negative-checks rule 3): this repo's own
      `specs/.core/env.config.json` reports nothing; the shipped
      `specs/.core/env.config.json.example` reports nothing — that one is the
      drift guard that keeps `KNOWN_KEYS` honest as keys are added; an absent
      config reports nothing; an empty `{}` reports nothing.
- [ ] Assert the advisory is on stderr and stdout stays parseable — run a
      `--json` subcommand with an unknown key present and `JSON.parse` stdout.
- [ ] Run `pnpm test` from the repo root — green before the phase is done.

## Notes

A known key whose *value* was rejected — `mode: "Checkout"`,
`review.reader: "remote "`, a non-boolean `review.required` — is deliberately
out of scope. Each already falls through to a conservative default that carries
a comment explaining why, and widening this check to cover them is a separate
decision about how loud a rejected value should be.

The advisory fires on every invocation, including inside loops. That is
intended: an unknown key is a config error, not a transient state, and it stops
the moment the key is fixed or removed.
