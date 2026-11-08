---
github_identifier: "#123"
github_url: "https://github.com/SkitterByte/skitterspec/issues/123"
---

# Ticket summary block — the ticket says what the work is, the spec stays in git

> **Type:** Feature
> **Name:** feat-tracker-held-specs (the spec folder name — the handle you paste into `/spec-start`; it predates the 2026-11-08 redirect and no longer describes the work)
> **Status:** Draft — spike first; build phases follow its result
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-11-06
> **Area:** packages/sync-core/src (normalize.js `buildDescription`/`phaseModeFor`, compare.js), packages/{github,linear,jira,azure-boards}/src (config defaults, adoption comment), packages/common/assets/skills (spec, spec-push)
> **Stack:** worktree
> **Docs:** none: phase 1 is a spike; pages are named when phase 2 is built
> **Origin:** follow-up from `feat-pr-landing` (#106); redirected 2026-11-08 away from the library-checkout model
> **Next spec:** none

## Problem

A push writes the whole spec overview into the ticket description and each
phase as a sub-issue. That is a planning document in a place built for a
summary: the project team reads a wall of Decisions and Impact rows they will
not use, each sub-issue repeats its phase's task list, and any text a PM writes
in the description is replaced on the next push (now loudly, but still
replaced). What a team working from tickets actually wants is **what the work
is, what done looks like, who has it, what state it is in, and how far along**
— and the repo already knows all five.

## Decisions

1. **Specs stay in git, unchanged.** The library-checkout model (tracker-held
   dormant specs, materialised at `/spec-start`) is dropped, and with it the
   round-trip fidelity risk: nothing is ever read back from a ticket.
   PR-mode authoring stays with `land.specDocs`. #93 Decision 1 stands as
   written.
2. **The repo owns one block of the description, not the description.** Push
   writes a delimited **managed block** — summary, progress, link to the spec —
   and splices it into whatever the ticket already says, leaving text outside
   the block alone. Read-modify-write of the description is a splice, not a
   pull: nothing outside the block is parsed, merged or written to a spec.
3. **The block is what a ticket workflow keys off.** In order: the summary
   (an optional authored `## Summary` — what the work needs, no phase
   breakdown — falling back to Problem's first paragraph), **acceptance
   criteria** (a new optional `## Acceptance criteria` section, projected as a
   checklist — what refinement, QA and a definition of done read), **surfaces
   touched** (the Impact table's Surface column as one line), the **gating**
   value where gating is configured, progress, and a link to the spec. Every
   part is skipped, never invented, when its source is absent.
4. **Sub-issues stay, and get summaries too.** The phase options are kept as
   they are (`subissue`/`deferred`/`inline`, plus a new `none`), so the
   2026-08-28 decision holds — sub-issues are assignable, description sections
   are not. A phase sub-issue's description becomes its own managed block: the
   phase's Goal line plus `n of m tasks`. The task checklist stays in git
   (`mapping.tasks` already supports dropping it).
5. **Default for new installs; existing installs pinned.** `mapping.description`
   defaults to `summary`, and `skitterspec update` writes an explicit
   `"spec"` into a config that predates the key, so an upgrade rewrites no
   ticket. A project switches by changing one value.
6. **Progress is ticked tasks.** `% done` = ticked checkboxes over all
   checkboxes across the phase files, shown in the spec ticket's block as
   `62% · phase 3 of 4` and in each sub-issue's as `n of m tasks`. Where a provider has a native number field (a GitHub
   Projects field, Azure's completed work, a Jira custom field) it is an opt-in
   config naming that field; without one, the block text is the whole answer.
7. **Status and assignment are untouched.** The tracker owns them under `pull`
   exactly as #93 set up; the repo still sends a transition only when it acts on
   code. Progress is a content field, so it is `push`.
8. **Drift check narrows to the block.** `compareStored` hashes the managed
   block only, so a PM's paragraph outside it is never reported as drift — and
   adoption no longer needs to post the original report as a comment in summary
   mode, because the original stays in the description.

## Solution overview

Phase 1 measures, per provider, which delimiter survives a write and read-back
of the description (an HTML comment on GitHub/Azure; Linear and Jira ADF are the
unknowns — a heading or panel may have to stand in). Phase 2 builds the managed
block in sync-core — render, splice, scoped drift hash — for the spec ticket and
each sub-issue, plus `summary` mode, its default-and-pin, and `phases: none`.
Phase 3 adds progress, block text first and native fields where configured.
Phase 4 is the authoring side and docs: `/spec` writes `## Summary` and
`## Acceptance criteria`, setup skills offer the choice.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| `mapping.description` config key | add | `summary` (default) · `spec`, all four providers |
| `skitterspec update` config merge | update | pins `"spec"` into a config that predates the key |
| `mapping.phases` | update | gains `none` — no phase objects at all |
| `buildDescription` (sync-core `normalize.js`) | update | summary mode renders the managed block only |
| Phase sub-issue description (`normalize.js` ~L530) | update | summary mode: Goal + `n of m tasks` block |
| Description write (provider apply) | update | splice the block into the live description instead of replacing it |
| `compareStored` (sync-core `compare.js`) | update | hash the managed block, not the whole description |
| Adoption comment (`cli-sync.js` per provider) | update | skipped in summary mode — the original text is kept in place |
| `## Summary` spec section | add | optional; `/spec` writes it; falls back to Problem |
| `## Acceptance criteria` spec section | add | optional; `/spec` grills for it; projected as a checklist |
| Progress field | add | block text always; native field opt-in per provider |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Delimiter spike, per provider | ⬜ | [01-delimiter-spike.md](01-delimiter-spike.md) |
| 2 | Managed block + summary mode | ⬜ | [02-managed-block.md](02-managed-block.md) |
| 3 | Progress — block text and native fields | ⬜ | [03-progress.md](03-progress.md) |
| 4 | Authoring, setup skills, docs | ⬜ | [04-authoring-docs.md](04-authoring-docs.md) |

## Open questions

- [ ] Which delimiter each provider preserves in a description (phase 1 answers).
- [ ] Which native progress field each provider offers, and whether it needs a
      board/project setting first (phase 3 answers per provider).
- [ ] Switching an existing project from `spec` to `summary`: its pushed
      descriptions hold no block yet — does the first summary push replace the
      whole description once (and back it up as a comment), or prepend the block
      and leave the old spec text below it?
- [ ] Switching to `phases: none` leaves existing sub-issues frozen (one-way
      sync has no delete) — close them on the switch, or leave them?

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-11-06 | Draft | backlog | Reuben Greaves |

## Changelog

- 2026-11-06 — Spec created from the `feat-pr-landing` follow-up so the design
  context outlives the session (source: that spec's Changelog and the
  2026-11-06 PR-mode design conversation). Draft by design: the spike decides
  what is built.
- 2026-11-08 — Reviewed and redirected: specs stay in git, so the
  library-checkout model, its round-trip fidelity spike and the #93
  reconciliation are dropped. The ticket instead carries a repo-owned summary
  block with progress, beside text the team writes. Phases are an independent
  axis (`phases: none` added) so the 2026-08-28 sub-issue decision holds for
  teams that need it. Old phases 1–2 replaced; their sub-issues #124/#125 are
  reused by the new phases 1–2. Folder name kept to keep the link; it no
  longer describes the work. Questions picked with no stated preference, so
  the recommended answers were taken — revisit on the review page.
- 2026-11-08 — Grilled for ticket workflows: sub-issue options kept and their
  descriptions become summary blocks too (Goal + task count); the spec block
  gains acceptance criteria, surfaces touched and gating; `summary` is the
  default for new installs with existing configs pinned to `spec`; the repo
  owns a managed block, not the whole description.
