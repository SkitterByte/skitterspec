---
linear_identifier: "SKS-181"
linear_url: "https://linear.app/skitterbyte/issue/SKS-181/the-phase-end-review-offer-has-to-land"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The phase-end review offer has to land

> **Type:** Feature
> **Name:** feat-review-offer-lands (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-12)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-12
> **Area:** packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/skills/{spec-next,spec-bug,spec-hotfix,spec-diff}/SKILL.md
> **Stack:** worktree

## Problem

`/spec-diff` works and `/spec-next` step 5 fires — 10 times in one day across
three specs — yet the operator reported never once being offered a diff. Two
causes, both real.

**The offer does not read as an offer.** Step 5 emits a fenced two-line block
into the tail of a ~400-word phase report, after the test counts and the leak
check, and the message then *ends* on `**Next:** phase 2 … Commit phase 1 first`.
Nothing is addressed to the reader; the last instruction they get is to commit
and move on, so that is what they do.

**Committing empties the page.** `collectReview` defaults to `mode: 'working'`
— uncommitted work vs HEAD (`packages/common/src/env/review.js:171`) — and the
skill renders *before* the commit it then tells you to run. Afterwards the
default view is empty: `spec-env review feat-no-branch-autopush` on a committed
branch prints `0 files, +0 -0 … nothing to review — no changes found`. The one
window in which the page has content is the window the report tells you to close.

Separately, only `/spec-next` carries the step at all: `/spec-bug` and
`/spec-hotfix` drive their own phases red→green and render nothing, which is why
`bug-fork-check-worktree-path` is the only spec of that day's four with no page
on disk.

## Decisions

1. **The clean-tree fallback lives in the engine, and is announced.** When
   `--branch` was *not* passed and the working collection comes back empty,
   `specEnvReview` re-collects in `branch` mode and says so. Every caller —
   `/spec-diff`, `/spec-next`, `/spec-bug`, `/spec-hotfix` — gets it without
   four copies of the same conditional. Nothing is lost by the swap: working
   mode was empty by definition. Rejected putting the check in the skills (the
   same prose in four files) and rejected making `--branch` the default (it
   changes what every existing invocation means, and loses the cheap "what did
   this phase just do" view).
2. **An explicit `--branch` stays literal, and a non-empty tree is never
   overridden.** The fallback fires on exactly one state — no flag, zero files —
   so the flag always means what it says and a real working diff is never
   swapped out from under the reader.
3. **No merge-base means "cannot tell", so nothing happens.** The existing
   `--branch` path already refuses when base and HEAD share no history; the
   fallback inherits that and prints the current empty-state message rather than
   diffing against the base tip and reporting every file in the project as
   changed (`.claude/rules/negative-checks.md`, rule 4).
4. **The offer becomes the last thing in the report, worded as a question.**
   Not a fenced block of quoted output, and it moves *after* `Next: phase N`, so
   it is the last thing on screen. Rejected a blocking question that ends the
   turn: it would interrupt the chained `/commit && /spec-next` rhythm on every
   phase, and the cost of being missed is lower than the cost of being in the way.
5. **The step is copied into all three skills and pinned by a test.** Three short
   prose blocks, plus a test asserting each of `/spec-next`, `/spec-bug` and
   `/spec-hotfix` carries it — renders after green, offers, never publishes.
   Drift becomes a red test instead of a silent gap. Rejected adding an include
   mechanism to `scripts/build-dist.js`: new build machinery for three blocks.
   (Note the provider skills under `packages/skitterspec-linear/assets/skills/`
   are *generated* from the common ones through seams — there is one source per
   skill to edit, not two.)
6. **`/spec-complete` is out of scope.** Reviewing a whole spec before landing is
   a separate question from reviewing a phase, and decision 1 already lets
   `/spec-diff` answer it on demand from a clean tree.

## Solution overview

`specEnvReview` (`packages/common/src/cli.js:1466`) picks `mode`/`ref` before
collecting. The fallback slots in after the first collection:

```
collect working
  → totals.files > 0        → render as today
  → totals.files === 0 and no --branch
      → merge-base(base, HEAD)?
          → yes → re-collect in branch mode, render, announce the swap
          → no  → render empty, print today's "nothing to review" message
```

The page already surfaces which view it is showing
(`packages/common/assets/review/page.html:1103` — `everything since <base>` vs
`uncommitted work`), so it needs only the reason appended, not new plumbing.

CLI output gains one honest line:

```
spec-env review: feat-x (working tree clean — since main)
  14 files, +812 -96
  page: …/.spec-env/reviews/feat-x.html
  open: file:///…/feat-x.html
```

And the phase report ends, rather than begins, with the offer:

```
**Next:** phase 2 — /spec-start stops pushing the branch.

Page is rendered: file:///…/feat-x.html
Want a written review of it before you commit?
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review` — clean-tree fallback to branch mode, announced in the header line |
| Page template | update | `assets/review/page.html` subtitle names the fallback, not just the mode |
| Skill | update | `/spec-next` step 5 — offer moves last, worded as a question |
| Skill | update | `/spec-bug` — render + offer between GREEN and Report |
| Skill | update | `/spec-hotfix` — render + offer between GREEN and Report |
| Skill | update | `/spec-diff` — document the fallback where it states the working-tree default |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine: a clean tree falls back to the branch, announced | ✅ | [01-clean-tree-fallback.md](01-clean-tree-fallback.md) |
| 2 | `/spec-next`: the offer goes last and asks | ✅ | [02-offer-goes-last.md](02-offer-goes-last.md) |
| 3 | `/spec-bug` and `/spec-hotfix` render too, pinned by a test | ✅ | [03-bug-and-hotfix-render.md](03-bug-and-hotfix-render.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-12 | Ready | backlog | Reuben Greaves |
| 2026-09-12 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-12 — Spec created.
- 2026-09-12 — Phase 1: fallback tests landed in a new
  `env-review-fallback.test.js` rather than `env-review.test.js`. The named file
  unit-tests `collectReview`; the fallback is a CLI-level decision about which
  mode to collect in, and the CLI harness lives beside the notes tests.
- 2026-09-12 — Phase 1 surfaced an unrelated defect in `/spec-next` step 1: its
  validation command `spec-env resolve --dir <path>` cannot do what the step
  says. `--dir` sets the **repo root** (`cli.js:2248`), not the worktree to
  resolve from, so on a repo with several worktrees it refuses with "name the one
  you mean" instead of confirming the path. Added as a task to phase 2, which
  already edits that file.
- 2026-09-12 — Phase 2: offer-shape tests landed in a new
  `assets-offer-last.test.js` rather than `assets-review.test.js`, which guards
  the page template and not skill prose. The `--dir` fix went into
  `assets-spec-next-worktree.test.js`, whose existing test had been *pinning*
  the broken command.
- 2026-09-12 — Phase 2 confirmed the `/spec-diff` publish gap first seen when
  the operator could not open a `file://` link on a phone: the engine writes a
  complete HTML document and the artifact host wraps page *content*, so
  publishing needs an unwrap step that `/spec-diff` §6 does not mention. Step 5
  now points at §6 for it; making publishing one step is its own spec.
- 2026-09-12 — Phase 3 found the hotfix half of its own plan untrue: the review
  path ignored `spec.baseRef` and measured a hotfix from `main`. Fixed in the
  engine (one `reviewBase()` helper shared by `--branch` and the fallback) so the
  skill's prose describes what the tool does. Beyond a wrong label, a base tag
  that is not an ancestor of the base branch widened the range to include
  commits the hotfix never touched.
