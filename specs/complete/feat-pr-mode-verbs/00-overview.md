---
github_identifier: "#330"
github_url: "https://github.com/SkitterByte/skitterspec/issues/330"
---

# PR-mode verbs and a vocabulary without "main"

> **Type:** Feature
> **Name:** feat-pr-mode-verbs (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/330
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Area:** packages/common/assets/skills/{spec-to-main,spec-complete,spec-next,spec-start,spec-diff,no-spec,spec,spec-init}, packages/common/assets/commands/{allow-main,spec-live,spec-skip,allow-project}.md, packages/common/assets/rules/spec-planning.md, packages/common/assets/claude-md-section.md, packages/common/assets/core/env.config.md, packages/common/assets/review/page.html, packages/common/src/{cli.js,init.js}, packages/common/src/env/{config,live,mainguard,review,integrate,nextaction}.js, docs/{index,reference}.html
> **Stack:** worktree
> **Docs:** reference, index, github, linear, jira, azure-boards

## Summary

PR-based projects get verbs that say what they do: `/spec-pr` opens a draft
PR mid-spec and readies it at the end, and `/spec-complete` means *done* —
it runs once, after the merge. Trunk projects get `/spec-land` for a mid-spec
land. Nothing in the command set says "main" any more, so a project whose
base is `master` or `2026/Q4` reads true.

## Problem

On a PR-mode project (LSC: `land.strategy: "pr"`, base `20??/Q?`) the flow
felt like too many steps and too many meanings. `/spec-complete` had to run
twice — the first run only readies a PR, so "complete" was least true exactly
when it ran. Phases with manual steps kept sending the operator to
`/spec-to-main` whenever live refused a migrations branch, and in PR mode
that only opens a draft PR, which puts the work nowhere testable. And "main"
named three different things — the base branch, the primary checkout, the
live instance — in `/spec-to-main`, `/spec-live main` and `/allow-main`, on a
project where no branch is called `main`. Separately, a `/spec-complete` on
LSC did not push or open the PR at all; the cause is not known.

## Acceptance criteria

- In PR mode, `/spec-pr` mid-spec pushes the branch and opens or updates a
  **draft** PR; with every phase ✅ it runs the disposition pass and flips the
  PR ready (or opens it ready).
- In PR mode, `/spec-complete` before the merge refuses `⏸`, naming the PR and
  `/spec-pr`; after the merge it finalises and tears down in one run.
- In ff mode, `/spec-land` does what `/spec-to-main` did, and refuses in PR
  mode naming `/spec-pr`. `/spec-pr` works under any configured strategy,
  passing `--strategy pr` where the config is not PR mode.
- A manual-steps stop whose branch live refuses never names `/spec-to-main`:
  it follows `live.refusedReach`, or with the key unset relays live's refusal
  and lists the three reaches.
- `/spec-to-main`, `/spec-live main`, `/allow-main` and
  `guards.mainIsLandingZone` are gone; `skitterspec update` prunes the retired
  files, and a config still carrying the old key gets a warning naming the new
  one.
- Reports and plans name the actual base branch (`master`, `2026/Q4`), never
  the word `main` standing for it.

## Decisions

1. **`/spec-pr` + `/spec-complete` after the merge**, not `/spec-complete` +
   `/spec-merged`. "Complete" keeps one meaning in both modes; the step that
   readies a PR is named for the PR. `/spec-merged` was rejected because it
   left `/spec-complete` meaning "ready a PR" in one mode and "land" in the
   other.
2. **`/spec-pr` is one verb, two behaviours by phase state.** Any phase not ✅
   → draft (repeatable, replaces `/spec-to-main` §4b). All ✅ → the
   disposition pass, consent naming `<remote>/<base>`, push, ready. This is
   today's `/spec-complete` run 1 moved, not rewritten.
3. **`/spec-complete` in PR mode is today's run 2 only.** Not merged →
   `⏸`, no edits. The bucket move under `specDocs: "branch"` already rides
   the PR via run 1; it moves to `/spec-pr`'s ready path with the rest.
4. **`/spec-to-main` becomes `/spec-land` for ff mode.** `/spec-land` refuses
   in PR mode naming `/spec-pr`; `/spec-pr` is the explicit PR route in any
   mode (amended 2026-11-26), rather than one mode-neutral verb
   (`/spec-integrate` was rejected — a command whose effect depends on config
   is the murk this spec removes).
5. **How a refused branch is reached is a project setting:
   `live.refusedReach`** — `worktree` (run it from the spec's worktree),
   `pr` (draft PR for a pipeline to deploy), `live-confirm` (live takes it
   after the operator confirms). Teams test migration branches differently,
   so the skill must not guess. Unset → relay the refusal and list the three.
6. **`live-confirm` is a recorded bypass**, raised under
   `.claude/rules/offered-unblocks.md`: the engine declares the offer, the
   operator answers, once per arming. Claude never lifts the migrations guard.
7. **Old names are dropped now, no aliases** (operator's call). This is a
   breaking release of `skitterspec` (major bump, `Release-Note!:`).
   `guards.mainIsLandingZone` is renamed `guards.baseIsLandingZone`; the
   loader warns on the old key rather than reading it — ignoring it silently
   would turn a guard back on with no word why.
8. **One word per concept**: *base* (the branch work merges into), *root
   checkout* (the primary folder), *live* (the running instance).
   `/spec-live off` hands the root checkout back; `/allow-base` lifts the
   base guard. Reports name the resolved branch.
9. **The LSC "did not push" failure is reproduced, not guessed.** Phase 1
   pins PR-mode readying with a test of the plan `/spec-pr` runs; a cause found
   there is fixed in that phase, one not found is recorded in the Changelog.

## Solution overview

- New skill `spec-pr/SKILL.md`: §4b of `spec-to-main` (draft) plus §6-pr run 1
  of `spec-complete` (disposition, consent, push, ready). Engine unchanged:
  `spec-env integrate <name> --draft | --push`.
- `spec-complete` §6-pr shrinks to the post-merge finish; its pre-merge
  branch refuses. `integrate` already tells the two apart
  (`(pr)` plan vs `already landed … finish what the merge deferred`).
- `spec-to-main/` → `spec-land/`, ff only; added to `RETIRED` pruning in
  `init.js` so `update` removes the old skill.
- `live.refusedReach` in `config.js` (validated: `worktree` · `pr` ·
  `live-confirm` · unset); `spec-next` §manual-steps reads it; the live
  migrations refusal declares a `bypass` offer when it is `live-confirm`.
- `LIVE_VERBS` gains `off`; `main` stops being documented; `allow-main.md` →
  `allow-base.md`; `mainguard.js` prose and config key renamed.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | add | `/spec-pr`, `/spec-land` |
| Skill | remove | `/spec-to-main` |
| Skill | update | `/spec-complete` (PR mode: post-merge only), `/spec-next` (manual-steps reach) |
| Command | add | `/allow-base`, `/spec-live off` |
| Command | remove | `/allow-main`, `/spec-live main` |
| Config key | add | `live.refusedReach`, `guards.baseIsLandingZone` |
| Config key | remove | `guards.mainIsLandingZone` (warned) |
| CLI command | update | `spec-env live off`; migrations refusal may carry a `bypass` offer |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done · ➖ cancelled.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-pr`, and `/spec-complete` as the post-merge finish | ✅ | [01-spec-pr.md](01-spec-pr.md) |
| 2 | `/spec-land` replaces `/spec-to-main` in ff mode | ✅ | [02-spec-land.md](02-spec-land.md) |
| 3 | `live.refusedReach` for manual-steps stops | ✅ | [03-refused-reach.md](03-refused-reach.md) |
| 4 | Vocabulary: base, root checkout, live; docs | ✅ | [04-vocabulary.md](04-vocabulary.md) |

## Open questions

- None

## Changelog

- 2026-11-26 — Spec created, from a sense-check of PR mode on LSC.
- 2026-11-26 — Phase 1: `integrate` now counts a PR the host merged at this
  HEAD as landed. A squash or rebase merge never satisfies ancestry, so the
  post-merge `/spec-complete` would have planned a new PR instead of the
  finish. Added to phase 1 as a task.
- 2026-11-26 — Phase 1: LSC's "spec-complete did not push" is not in the
  engine — the PR plan for the LSC shape (specDocs branch, `20??/Q?` base) is
  correct and now pinned by a test. Likeliest cause: the old two-run skill
  put the push after the report section. `/spec-pr` makes the push its job.
- 2026-11-26 — Decision 4 amended: `/spec-pr` no longer refuses outside PR
  mode; it passes `--strategy pr`, because LSC lands some features by PR and
  some directly. It is model-invocable (the autonomous `pr` ending hands off
  to it); the push stays behind its consent ask.
- 2026-11-26 — Phase 2: no pruning code was needed — `update` already removes
  any managed file a version stops shipping (pristine only). `/spec-land`
  stays user-only, as `/spec-to-main` was, and takes `--strategy ff` for a
  project that mixes routes. The MIGRATION entry moves to phase 4, with the
  other renames.
- 2026-11-26 — Docs sweep, at the operator's request: the static site
  (index, reference, and the four provider pages), the providers'
  tracker-sync seams and the held-state engine messages now describe
  `/spec-pr` then `/spec-complete` rather than "run 1 / run 2". The two
  `docs/rationale/` files are left alone on purpose: they are frozen copies
  of old rules, matched by hash on upgrade. `Docs:` gains the provider pages.
- 2026-11-26 — Phase 3: the bypass is spent per branch HEAD (new commits are
  new work, asked again) and recorded in a gitignored ledger beside the live
  receipt (`.spec-env/live-bypass.json`), not the spec's Changelog — a take
  checks the branch out in the primary checkout, so writing the spec there
  would dirty it. An unknown `refusedReach` reads as unset, never as the
  bypass. Phase 4 note: the loader already reports unknown keys, so the
  retired `guards.mainIsLandingZone` warns with no new mechanism.
- 2026-11-26 — Phase 4: `connect main` became `connect off` too, so the
  family has one word; naming the base branch still works for both, but the
  literal `main` no longer releases on a repo whose base is not `main`. The
  engine verb `spec-env main` and the `main-guard` hook keep their names —
  internal plumbing nobody types, and renaming the hook would break every
  installed `settings.json`. The old config key's warning names the new key
  (`RENAMED_KEYS`). Parked distributions (Linear, Jira) are not built, so
  their `MIGRATION.md` copies are synced by hand. A guard test now fails if a
  retired name reappears in a shipped file or site page.
- 2026-11-26 — Completed; all phases done, tests green.
