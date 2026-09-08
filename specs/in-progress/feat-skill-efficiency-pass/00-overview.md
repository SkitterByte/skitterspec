---
linear_identifier: "SKS-72"
linear_url: "https://linear.app/skitterbyte/issue/SKS-72/skill-and-command-efficiency-pass"
---

# Skill & command efficiency pass

> **Type:** Feature
> **Name:** feat-skill-efficiency-pass (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-08)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-08
> **Area:** packages/common/assets (skills, rules, claude-md-section.md), packages/linear/assets/skills, packages/common/README.md, scripts/compose.js, scripts/build-dist.js
> **Stack:** worktree

## Problem

The shipped skills and commands are the product, and they spend context three
ways that don't buy judgment: (1) every session pays for 13 skill descriptions
(~6.3k chars) plus a CLAUDE.md section and a rule file that restate each other's
lifecycle table and isolation prose; (2) several large instruction blocks (the
Impact-map guidance, the worktree provision/bootstrap block, teardown, target
identification) are pasted near-verbatim across 2–6 skills, so every fix must be
made N times and drift is already visible; (3) `spec-init` still names the
removed `spec-ready` skill and counts "eight skills", and `packages/common/README.md`
still lists `/spec-ready` — retired claims on shipped surfaces. `/spec`'s
one-question-at-a-time grill also forces a model round trip per question even
when questions are independent.

## Decisions

1. **Descriptions carry triggers + outcome only; mechanism moves to the body.**
   Descriptions are loaded into every session; the body loads only on
   invocation. Keep the "Use when …" trigger phrases (they do the routing).
   Budget: ≤ 500 chars per description, enforced by test. Rejected: leaving the
   long descriptions as extra routing signal — the wins are in triggers, not in
   transport/plumbing detail like "runs `spec-sync push` then `apply`".
2. **The lifecycle table and conventions live in `spec-planning.md` only;
   `claude-md-section.md` shrinks to the everyday loop, the skills-vs-commands
   note, and pointers.** Both files are always loaded, so duplication is pure
   cost. Rejected: keeping the table in CLAUDE.md and slimming the rule — the
   rule is the canonical reference the skills all point at.
3. **Deduplicate shared skill blocks at build time with common fragments,
   reusing the existing seam mechanism** (`scripts/compose.js`): a
   `packages/common/assets/seams/` dir of fragments filled into *both*
   distributions, merged with (and named disjoint from) provider fragments.
   Only blocks ≥90% identical are extracted (Impact-map guidance ×3, the
   spec-bug/spec-hotfix provision-bootstrap-trust block, identify-target-spec
   ×6, teardown sub-steps ×2); deliberately divergent wording stays local.
   Rejected: runtime reference files (progressive disclosure) — the blocks are
   always needed when the skill runs, so it adds a read without saving tokens,
   and `init.js` installs exactly one `SKILL.md` per skill (init.js:208).
   Rejected: leaving duplication — three drift incidents were the prompt here.
4. **Retire `spec-ready` from shipped surfaces and guard it** docs-claims-style.
   The guard excludes MIGRATION.md files, which legitimately name the retired
   skill historically (negative-checks: name the blind spot beside the check,
   and pair the accusation with a stays-silent test on MIGRATION.md).
5. **Grilling batches independent questions.** `/spec` Phase A and
   `/spec-review` §3 allow up to 4 independent questions per round via the
   multi-question ask tool when available; strictly sequential only when an
   answer gates later questions. Rejected: keeping one-at-a-time always —
   it costs a round trip per question with no quality gain when independent.

## Solution overview

Four small passes over the shipped assets, each leaving the composed
distributions byte-identical in meaning: fix the stale claims and add a retired
-phrase guard; rewrite the 13 descriptions and slim `claude-md-section.md`
(resync the repo's own CLAUDE.md to match); extend `compose.js`/`build-dist.js`
to merge common fragments and extract the near-identical blocks into
`packages/common/assets/seams/`; amend the two grilling passages. Rebuild dists
(`pnpm build`) after each asset change so `packages/skitterspec*` stay composed
from source.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | all 13 SKILL.md descriptions (≤500 chars) |
| Skill/rule | update | spec-init §"eight skills" list; spec, spec-review grilling passages |
| Skill/rule | update | claude-md-section.md (slimmed); spec-planning.md (sole owner of table) |
| Build | update | compose.js + build-dist.js merge common fragments from assets/seams/ |
| Docs | update | packages/common/README.md drops /spec-ready |
| Test | add | retired-phrase guard (spec-ready), description length budget, common-fragment compose tests |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Retire stale spec-ready claims + guard | ✅ | [01-stale-refs.md](01-stale-refs.md) |
| 2 | Trim always-loaded context | ⬜ | [02-trim-always-loaded.md](02-trim-always-loaded.md) |
| 3 | Single-source shared blocks via common fragments | ⬜ | [03-shared-fragments.md](03-shared-fragments.md) |
| 4 | Batched grilling | ⬜ | [04-batched-grilling.md](04-batched-grilling.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-08 | Ready | backlog | Reuben Greaves |
| 2026-09-08 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-08 — Spec created from an efficiency review of all shipped skills/commands.
- 2026-09-08 — Phase 1: the base README's skill table was stale beyond the
  `/spec-ready` row (`/spec` status wrong, `/spec-hotfix` and `/spec-to-main`
  missing), so the whole table was refreshed to the canonical nine rather than
  half-fixed.
- 2026-09-08 — Phase 1: scoped the retired-skill guard to a skill-table ROW
  rather than the bare name. `packages/skitterspec/README.md` is a scanned
  surface and legitimately names the retired skills in its v3 version history,
  so a string match would have accused correct history.
- 2026-09-08 — Phase 1: added a positive check (spec-init's enumeration vs the
  skills on disk) beyond the negative guard the phase specified — the guard
  catches a retired name that lingers but not a new skill the sentence forgets.
