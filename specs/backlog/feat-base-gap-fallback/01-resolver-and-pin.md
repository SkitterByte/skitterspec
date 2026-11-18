---
github_issue_id: "#231"
---

# Phase 1 — Resolver, pin store and `spec-env base` verbs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the resolver knows about the gap, the pin and the fallback; `spec-env
base` can write, show and remove the pin — proven by unit tests on the pure
resolver and CLI tests on `base`.

## Tasks

- [ ] Add `baseBranchFallback` to `env/config.js` (default `''`, validated like
      `baseBranchPattern`; unusable = unset) and document it beside
      `baseBranchPattern` in `assets/core/env.config.md`.
- [ ] Extend `describeBaseBranch(config, git, pin)`: under a pattern with no
      match, a pin whose `pattern` equals the configured one → `{ base: pin.base,
      how: 'gap-pin' }`; otherwise the refusal plus an `offer` when the fallback
      (`baseBranchFallback` → `origin/HEAD`) resolves, none when it does not.
      A match ignores any pin. `BaseUnresolvedError` carries `offer`.
- [ ] Name the blind spot beside the check: an unfetched remote looks like a gap
      (`.claude/rules/negative-checks.md` rule 2) — `--use-fallback` fetches
      before it pins, and refuses to pin when the fetch shows a match.
- [ ] Add the pin store helpers (read / write / delete
      `.spec-env/base-pin.json` in the primary checkout); an unreadable pin is
      no pin.
- [ ] `spec-env base --use-fallback` writes the pin; `--unpin` removes it; bare
      `base` reports `pinned for the gap: master (since <date>)` and deletes a
      pin a match has made stale. `--json` carries `pin`.
- [ ] Tests (`env-resolve.test.js`, a `spec-env base` CLI test): match wins over
      pin; pin for another pattern ignored; fallback from config, from
      origin/HEAD, and neither (no offer); stays-silent cases — no pattern, and
      pattern matching — produce no offer and no pin line.
- [ ] Run `pnpm test` — green before the phase is done.
