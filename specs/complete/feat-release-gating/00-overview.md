---
linear_identifier: "SKS-92"
linear_url: "https://linear.app/skitterbyte/issue/SKS-92/release-gating-offer-the-flag-record-the-answer"
---

# Release gating — offer the flag, record the answer

> **Type:** Feature
> **Name:** feat-release-gating (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-09
> **Area:** packages/common/src/{gating.js,cli.js,init.js,prompts.js}, packages/common/assets/{core,skills,rules}, packages/common/test
> **Stack:** worktree

## Problem

A spec can run `/spec` → implementation → `/spec-complete` without anyone ever
deciding whether the change ships behind a feature flag, and without the artefact
recording that the question was asked. The omission is invisible rather than
reviewable: "no flag mentioned" and "we considered it and said no" look identical.

Raised from `~/code/ereqs`, which already had a project rule for this. Prose was
not enough — `feat-order-documents`, a user-visible UI change landing on `main`,
was specced, built across four phases and taken to `/spec-complete` with the rule
in context the whole time and no flag ever offered. The user then had to ask "is
this supposed to be behind a FF?" — a question the spec should have answered by
construction. Per `.claude/rules/negative-checks.md`, an absence carries no
information, and the prose mechanism has now demonstrably failed once.

## Decisions

1. **Bake in the offer, never the mechanism.** Skitterspec must not learn how any
   project does flags (resolvers, admin toggles, env precedence). It asks the
   question, cites the project's own doc, and records the answer. The user's
   framing: *"not that how, just the offer of flagging"*.
2. **Config is `specs/.core/gating.config.json`; presence is the switch.** Exactly
   the `env.config.json` / `linear.config.json` pattern — one file per concern,
   absent = feature unused. No flag configured is read as "this project does not
   use feature flags". Rejected the handoff's `spec.config.json`: a general
   grab-bag, and one word off `skitterspec.config.json`, a retired name that
   `packages/common/src/deprecate.js:17` actively deletes.
3. **Two config fields, both optional.** `guidance` is a repo-relative path to the
   project's own flag doc — skitterspec never reads it, only cites it when asking.
   `default` is the wording written when the user declines a flag, so a project can
   standardise its `none:` phrasing.
4. **Engine-backed check with tests, not prose.** Prose already failed once; a
   check with a stays-silent test is precisely the thing prose is not. New loader
   `src/gating.js` + `skitterspec gating check`.
5. **Advisory only — it never blocks.** `gating check` always exits 0 and reports;
   `/spec-start` and `/spec-complete` mention a missing header and carry on. Nothing
   in this spec can stop a spec being started, completed, or landed.
6. **`Gating:` is a header beside `Stack:`, but is not a `Stack:`.** `Stack:` is
   parsed because `/spec-start` *acts* on it (`readStackField`,
   `src/env/resolve.js:85`). Nothing ever acts on `Gating:` — it exists to be
   audited. Grammar: a flag name, or `none: <one-line reason>`. A bare `none`, an
   empty value or a missing line are all invalid — the reason half is the
   load-bearing part.
7. **The check reads active buckets only** — `specs/backlog/` and
   `specs/in-progress/`. `complete/` and `cancelled/` are never reported, which is
   the stays-silent guarantee for the 139 pre-existing specs. A pre-existing
   *active* spec is still reported, deliberately: it is in flight, the question
   genuinely still applies, and an advisory line costs nothing.
8. **`/spec-hotfix` pre-fills, `/spec-bug` grills.** A hotfix restores released
   behaviour under time pressure, so it writes
   `none: hotfix — restoring released behaviour` and asks only to confirm. A bug fix
   ships in the next release like a feature, so it asks the question properly.
   Rejected pre-filling both: a risky bug-fix rewrite is exactly where a kill-switch
   earns its keep.
9. **Adoption mirrors isolation exactly.** The example config and its field docs are
   always scaffolded (free — `listCoreTemplates()` globs `assets/core/`); the live
   `gating.config.json` is written only on explicit opt-in (`--gating`, or the
   fresh-init prompt); `update`/resync never activates it, because adopting a policy
   is a deliberate choice and not something a re-sync flips on.

## Solution overview

- **`specs/.core/gating.config.json`** — presence turns the feature on:

  ```jsonc
  {
    // Where THIS project documents how its flags work. Skitterspec never reads
    // this file; it cites the path when it asks the question.
    "guidance": ".claude/rules/feature-flags.md",
    // Written when the user declines a flag. Must keep the `none: <reason>` shape.
    "default": "none: <reason>"
  }
  ```

- **Header**, on `00-overview.md` directly under `> **Stack:**`:

  ```
  > **Gating:** <flag name — or "none: <one-line reason>">
  ```

- **`skitterspec gating check [spec] [--json]`** — advisory, always exit 0. Bare
  form resolves the spec in flight the way `spec-env` does; a name targets one spec;
  `--all` sweeps the active buckets.

  ```
  $ skitterspec gating check                     # gating off
  gating: not configured — nothing to check

  $ skitterspec gating check feat-order-documents
  feat-order-documents: no Gating: header
    → decide, then record it on 00-overview.md (see .claude/rules/feature-flags.md)
  ```

- **Skills.** `/spec` · `/spec-bug` · `/spec-hotfix` ask and emit the header;
  `/spec-review` · `/spec-complete` · `/spec-start` run the check and report;
  `/spec-init` mentions adoption. All gated on the config existing, so with it
  absent every skill's output is what it is today.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `specs/.core/gating.config.json` (`guidance`, `default`) |
| CLI command | add | `skitterspec gating check [spec] [--json] [--all]` |
| Spec header | add | `> **Gating:**` on `00-overview.md` |
| Skill | update | `/spec`, `/spec-bug`, `/spec-hotfix` emit · `/spec-review`, `/spec-complete`, `/spec-start` report · `/spec-init` |
| Rule | update | `assets/rules/spec-planning.md` — header grammar + the config gate |
| CLI command | update | `skitterspec init --gating`, fresh-init prompt, init report line |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Config, loader and the advisory `gating check` | ✅ | [01-config-and-check.md](01-config-and-check.md) |
| 2 | Authoring skills ask and emit the header | ✅ | [02-authoring-skills.md](02-authoring-skills.md) |
| 3 | Lifecycle skills report a missing header | ✅ | [03-reporting-skills.md](03-reporting-skills.md) |
| 4 | Install/init adoption and docs | ✅ | [04-init-adoption.md](04-init-adoption.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | Ready | backlog | Reuben Greaves |
| 2026-09-09 | In Progress | in-progress | Reuben Greaves |
| 2026-09-09 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-09 — Spec created from the `~/code/ereqs` handoff.
- 2026-09-09 — Completed; all four phases done, tests green (1469/1469). The
  `~/code/ereqs` handoff is answered: the offer is baked in, the mechanism is
  not, and a project without the config sees byte-identical behaviour. Nothing
  deferred.
- 2026-09-09 — Phase 4 built: `--gating`, a fresh-init prompt, `installGating`,
  the init report line, and the README section. `update` can never activate it;
  a customized config survives a resync. Both proved by hand and by test.
- 2026-09-09 — Phase 3 built: `/spec-review` treats a missing header as drift,
  `/spec-complete` reports without ever refusing, `/spec-start` mentions it once
  before phase 1, and `/spec-init` offers gating as its own opt-in. 5 more asset
  tests, including one asserting `/spec-complete` refuses to refuse.
- 2026-09-09 — Phase 2 built: `/spec`, `/spec-bug` and `/spec-hotfix` ask and
  emit the header; the rules file documents it. 7 asset tests guard the two
  properties that make it work — config-gated, and an offer rather than an
  imposition.
- 2026-09-09 — Phase 1 built: `gating.config.json` + its field docs,
  `src/gating.js` (loader, four-state header reader, advisory check), and
  `skitterspec gating check`. 12 tests, 8 of them stays-silent. The excluded
  buckets are out of range structurally, so a finished spec cannot be accused
  by a future edit — and does not even reach the denominator.
