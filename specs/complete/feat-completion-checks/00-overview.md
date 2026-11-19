---
github_identifier: "#246"
github_url: "https://github.com/SkitterByte/skitterspec/issues/246"
---

# Completion checks, and docs stamps that survive a rebase

> **Type:** Feature
> **Name:** feat-completion-checks
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/246
> **Author:** Reuben Greaves
> **Raised:** 2026-11-19
> **Area:** scripts/docs-freshness.js, packages/common/src/env/config.js, packages/common/src/cli.js, packages/common/assets/skills/spec-complete, packages/common/assets/core/env.config.md, specs/.core/env.config.json, .claude/rules/docs-freshness.md, CLAUDE.md, docs
> **Stack:** worktree
> **Docs:** index, reference

## Summary

A project can name checks for `/spec-complete` to run before every land, and
this repo uses that to run its docs-freshness report on every spec. Docs
`verified:` stamps no longer read as stale after a rebase, and re-reading a
page is one command to record.

## Problem

The docs convention says a spec checks its pages at completion, but nothing
runs it: `/spec-complete` is a shipped skill and the check is a repo-local
script, so it happens only when someone remembers the rule. Two specs
(`feat-base-gap-fallback`, `bug-hooks-engine-primary-checkout`) left
`review.html` unstamped. And a spec that does stamp gets undone by its own
landing: `integrate` rebases, the stamped commit becomes an orphan, and
`stale` counts every rebased commit against it — `feat-local-install`'s six
fresh pages were reported stale the moment it landed.

## Acceptance criteria

- A page stamped on a branch that then lands by rebase reads fresh on `main`.
- A stamp that cannot be matched to a commit on HEAD reads `cannot tell`,
  never stale.
- `node scripts/docs-freshness.js verify review` stamps that page with HEAD;
  `impact` and `stale` name the command beside each page they flag.
- A project that sets `complete.checks` sees each command run by
  `/spec-complete` before the land, its output in the report's `Notes`; a
  failing check makes the run `⚠️` and never stops the land.
- A project without `complete.checks` sees no change.
- This repo's `/spec-complete` runs `docs-freshness impact` on every spec.

## Decisions

1. **Resolve an orphaned stamp on read, by patch-id.** When `verified` is not
   an ancestor of HEAD, `stale` looks in `merge-base(verified, HEAD)..HEAD`
   for the commit with the same `git patch-id` and counts from it. Every past
   stamp heals with no migration. No match (the rebase changed the commit,
   e.g. a resolved conflict) is `cannot tell`, never stale
   (`.claude/rules/negative-checks.md` rule 4). Rejected: stamping after the
   land, which needs a commit on the base branch (landing zone); anchoring on
   the page's last edit, which would have hidden the real `review.html`
   staleness behind an unrelated one-line edit.
2. **`docs-freshness verify <page...>` writes `verified: <HEAD>`.** Re-reading
   a page and finding it right is then one command, not a hand edit nobody
   makes. Safe on a branch because of Decision 1. Unknown page names refuse;
   it never verifies a page not named.
3. **`complete.checks` is a generic, shipped `env.config.json` key**, not a
   docs-specific hook: skitterspec knows nothing about this repo's script, and
   other projects have their own end-of-spec questions. A list of commands,
   run by a new engine verb `spec-env checks <spec>` in the spec's worktree,
   so the skill runs one command and composes no shell.
4. **Advisory, always.** `checks` exits 0; a non-zero command is reported as
   `failed`, the run becomes `⚠️`, and the land proceeds. A check that
   refused landings would be the counting gate this workflow rejects, and its
   output is a reason to re-read, not proof of a fault.
5. **Run before the land, from the worktree.** `impact` compares the branch
   with its base, so it must run while the branch is still a branch.

## Solution overview

```jsonc
// specs/.core/env.config.json
"complete": { "checks": ["node scripts/docs-freshness.js impact"] }
```

`/spec-complete` §2, after the suite is green: `skitterspec spec-env checks
<spec>` runs each entry in the worktree and prints one block per command
(`ok` · `failed (exit N)` · its output); the skill relays it into `Notes`.
The `impact` output names `verify <page>` for each page it flags.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `complete.checks: string[]` |
| CLI command | add | `skitterspec spec-env checks [spec] [--json]` |
| CLI command | add | `docs-freshness.js verify <page...>` (repo-local) |
| Business rule | update | `stale` resolves orphaned stamps by patch-id |
| Skill/rule | update | `/spec-complete` runs `spec-env checks` before landing |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Stamps that survive a rebase, and `verify` | ✅ | [01-freshness-stamps.md](01-freshness-stamps.md) |
| 2 | `complete.checks` and `spec-env checks` | ✅ | [02-complete-checks.md](02-complete-checks.md) |
| 3 | Wire `/spec-complete`, this repo, and docs | ✅ | [03-wire-and-docs.md](03-wire-and-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-19 — Spec created, from `feat-local-install` landing six fresh
  pages as stale and `review.html` found unstamped.
- 2026-11-19 — Phase 1: `verify` exits 1 on a refused name — it is a
  write, not a report, so the always-exit-0 rule for reports does not cover
  it.
- 2026-11-19 — Phase 2: a malformed `complete.checks` is dropped silently,
  not warned on — the rule every other `env.config.json` list follows. The
  verb's `--help` line, the two verb lists and its `reference.html` row came
  forward from phase 3, because the docs-claims tests require them the
  moment the verb is dispatched.
- 2026-11-19 — Phase 3: `spec-env checks` reads `complete.checks` from the
  primary checkout's config, like every engine key — so the entry this spec
  adds runs from the next spec on, not on its own completion. `impact` flagged
  `index.html` (it covers the skills); its `/spec-complete` step now mentions
  the checks. A page's `verify` belongs after the spec's last code commit —
  stamping before it leaves that commit counted as drift — so `index` and
  `reference` are verified in a commit of their own after this phase.
- 2026-11-19 — Completed; all phases done, tests green.
