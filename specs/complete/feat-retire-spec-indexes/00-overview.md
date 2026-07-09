# Retire the folder index files

> **Type:** Feature
> **Status:** Complete (2026-07-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-09
> **Area:** src/init.js, test/init.test.js, assets/skills/spec{,-bug,-ready,-review,-go,-complete,-cancel,-init}/SKILL.md, assets/rules/spec-planning.md, assets/claude-md-section.md, README.md, specs/{backlog,complete}/00-index.md

## Problem

`specs/backlog/00-index.md` and `specs/complete/00-index.md` are hand-maintained,
committed **caches** of state that already lives in the source of truth: the
folder a spec sits in (bucket = status), its `feat-`/`bug-` prefix + `Type`
header, its per-spec **State log** (dated transitions), git history, and Linear
(live status when used). Keeping the cache in sync with its source is pure
overhead, and it becomes a **merge-conflict hotspot** the moment specs are worked
in parallel on branches — worst on the append-only completion log, where two
concurrent completions both prepend to the top and collide every time. AI can
answer "what's in backlog / what completed last" by reading the folders + State
logs on demand, so the pre-aggregation earns its keep less than it costs.

## Decisions

1. **Delete both index files and stop maintaining them.** `specs/backlog/00-index.md`
   and `specs/complete/00-index.md` are removed; no skill writes or reads them.
   Rejected: regenerating them as a derived view (still overhead for a query
   AI/Linear already serve on demand).
2. **The buckets + headers + State log are the source of truth.** "What's in
   backlog" = `ls specs/backlog/`; "what completed last" = `git log`/mtime on
   `specs/complete/` or the per-spec State-log dates. No behaviour is lost — git
   history retains the old rows.
3. **Preserve the phase index.** The per-spec phase table inside each
   `00-overview.md` (linking `01-…`, `02-…` with `⬜`/`🔄`/`✅`) is unrelated and
   stays — only the cross-spec **folder** indexes go.
4. **Workflow-wide, not isolation-gated.** The removal applies to the base
   workflow for everyone (one consistent mode), independent of per-spec isolation.
   This unblocks branch-based housekeeping in `feat-isolation-default-policy`
   (Decision 7 there).

## Solution overview

- **Skills:** strip every "prepend/remove/update a row in `00-index.md`"
  instruction from the eight spec skills; where a skill told you to *find the
  latest completed spec via the completion log*, point it at
  `git log`/`specs/complete/` instead. Leave all phase-index wording intact.
- **Rule:** remove the "Folder indexes (`00-index.md`)" section from
  `spec-planning.md` and any cross-references.
- **init:** drop `installIndexes`, the `BACKLOG_INDEX`/`COMPLETE_INDEX`
  templates, the `FOLDERS_WITH_INDEX` special-casing, and the closing-note
  mentions; folders are kept in git by `.gitkeep` as needed. **Migration:**
  `init`/`update` delete any retired index files a prior version left behind.
- **Docs:** update `README.md` and the CLAUDE.md section to drop the index files
  from the written-files list and descriptions.
- **Files:** `git rm` the two `00-index.md` files from this repo.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Remove index scaffolding from `init.js` + tests; delete the files | ✅ | [01-init-and-files.md](01-init-and-files.md) |
| 2 | Strip folder-index instructions from skills + rule + docs | ✅ | [02-skills-and-docs.md](02-skills-and-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-09 | Draft | backlog | Reuben Greaves |
| 2026-07-09 | In Progress | in-progress | Reuben Greaves |
| 2026-07-09 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-07-09 — Spec created. Prerequisite for `feat-isolation-default-policy`
  (Decision 7). Not added to `specs/backlog/00-index.md` — that file is what this
  spec removes.
- 2026-07-09 — Both phases implemented in one session; `init.js` scaffolding +
  tests updated, the two index files `git rm`'d, and folder-index instructions
  stripped from eight skills + the rule + README. Suite green (110/110). Awaiting
  `/spec-complete` + commit.
- 2026-07-09 — Added a migration: `init`/`update` now delete retired `00-index.md`
  files left by earlier versions (with `.gitkeep` for any emptied bucket) so
  upgrading projects are cleaned up. New test; suite 111/111.
- 2026-07-09 — Completed; all phases done, tests green (111/111).
