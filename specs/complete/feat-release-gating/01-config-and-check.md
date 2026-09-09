---
linear_issue_id: "SKS-93"
---

# Phase 1 — Config, loader and the advisory `gating check` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the config file, its loader, and a CLI check that reports a missing
`Gating:` header without ever blocking — proven by tests that make it fire and,
more importantly, that make it stay silent.

## Tasks

- [x] Add `packages/common/assets/core/gating.config.json.example` (`guidance`,
      `default`) and `gating.config.md` documenting the fields, in the voice of the
      existing `env.config.md`. Both are picked up automatically by
      `listCoreTemplates()` — no `init.js` change needed for scaffolding.
- [x] Add `packages/common/src/gating.js`: `loadGatingConfig(dir)` returning
      `{ config, present }` over frozen defaults, mirroring
      `loadEnvConfig` (`src/env/config.js`).
- [x] Add `readGatingField(specPath)` — parse `> **Gating:** …` from
      `00-overview.md`, returning `{ raw, kind }` where `kind` is `flag`, `none`,
      `invalid` (bare `none`, empty) or `missing`.
- [x] Add the `gating` verb to `src/cli.js` with the `check` sub-verb: bare form
      resolves the spec in flight the way `spec-env` does, a name targets one spec,
      `--all` sweeps `specs/backlog/` + `specs/in-progress/`. `--json` for the
      skills. **Always exit 0** — this reports, it does not gate.
- [x] With no `gating.config.json`, print `gating: not configured — nothing to
      check` and return without reading any spec.
- [x] Cite `guidance` in the missing/invalid message when it is set; say nothing
      about it when it is not.
- [x] Add the blind-spot comment beside the check, per
      `.claude/rules/negative-checks.md` §2: name what would make this lookup lie —
      a spec authored before gating was enabled has no header and is not broken,
      which is why completed/cancelled buckets are excluded and why it never blocks.
- [x] Add `packages/common/test/gating.test.js` covering: config absent → silent;
      header present as a flag name → silent; header present as `none: <reason>` →
      silent; spec in `complete/` or `cancelled/` with no header → silent (the
      legacy-spec guarantee); bare `none` → reported as invalid; header absent in an
      active bucket → reported; exit code is 0 in every one of those cases.
- [x] Run `node --test` — green before the phase is done.

## Notes

Deliberately no `--strict` / non-zero mode in this phase. The user's constraint is
that nothing blocks; adding an opt-in CI exit code later is a one-line change if a
project ever asks for it.

**As built.** Three things beyond the plan, none a change of intent:

- **`readGatingField` returns four kinds, not three** — `flag`, `none`, `invalid`,
  `missing`. The plan lumped a bare `none` in with an empty value; keeping
  `invalid` and `missing` apart lets the report say different things, because they
  *are* different: a bare `none` is someone answering without deciding, a missing
  line is nobody having been asked.
- **The report counts only what it checked.** A project with two active specs and
  a hundred finished ones reads `2 of 2`, never `2 of 102` — the excluded buckets
  are out of range, not filtered out, so they cannot appear in a denominator
  either.
- **A named spec that is not active says so rather than accusing.** `gating check
  feat-old` on a completed spec prints "no active spec named …", since gating
  never covered it.
