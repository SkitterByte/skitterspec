---
linear_identifier: "SKS-379"
linear_url: "https://linear.app/skitterbyte/issue/SKS-379/a-single-pass-fix-is-offered-the-verdicts-it-can-honour"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# A single-pass fix is offered the verdicts it can honour

> **Type:** Feature
> **Name:** feat-single-pass-buttons (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-21)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-21
> **Area:** `packages/common/src/env/review.js`, `packages/common/src/env/serve.js`,
> `packages/common/assets/review/page.html`,
> `packages/common/assets/skills/spec-bug/SKILL.md`,
> `packages/common/assets/skills/spec-hotfix/SKILL.md`
> **Stack:** worktree

## Problem

`/spec-bug` and `/spec-hotfix` end by rendering a review page, and neither passes
`--buttons` — so both take `DEFAULT_BUTTON_SET = 'committing'`
(`review.js:794`), which offers `Commit & Continue`. A single-pass fix has no
phase to continue into, so that verb cannot be honoured: pressing it commits
correctly and then `/spec-next` refuses, having nothing to build.

The page has a guard for exactly this — `noPhaseLeft` dims the button when
`data.phases.hasNextPhase === false` — and it cannot see these specs.
`readPhases` returns `null` outright for a folder with no `NN-slug.md` files
(`resolve.js:77`), deliberately: *"No phase files is not 'no phases' — it is a
legacy layout whose phases live inline in the overview, and this reader cannot
see them."* A single-pass bug spec is that shape, so the cannot-tell branch
leaves the offer standing.

Observed on `bug-note-editor` (SKS-378): the button was pressed, the commit was
right, and `/spec-next` refused with nothing to do. The cost is small and the
signal is wrong — a page that offers a verb it cannot deliver teaches readers to
distrust the bar.

## Decisions

1. **The skill declares the set; the engine does not derive it.** `review.js:262`
   already states the contract — the button set *"is the caller's declaration
   about the work, not a reading of the gate"* — and the skill is the one thing
   that knows, because it has just decided whether to phase the fix.
   *Rejected:* teaching `readPhases` a third answer from a positive signal in the
   overview. It would fix every caller at once, but it weakens the `null` that
   deliberately protects legacy inline-phase specs, to buy a case the caller can
   state outright.
2. **A new set, `fix`, rather than reusing `refresh`.** The contents are
   identical — `commit`, `changes`, `discuss` — but `refresh` means *a
   re-validated spec document* and is what `/spec-review` renders on `--docs`.
   The word is stored in the render record and read back by the serve daemon, so
   a name covering two unrelated renders would make the record ambiguous exactly
   where it is used to decide something.
3. **`fix` joins `NARROWING_SETS`.** Without it, `buttonsForView` falls through
   to the tree's family — `committing` — so every *served* re-render of the page
   would hand back `Commit & Continue` and the bug would return on each refresh.
   It qualifies under that list's own rule: it only ever narrows the offer, so a
   stale record costs a reader one refresh and never a verdict the skill cannot
   act on.
4. **A phased bug spec keeps the committing set.** `/spec-bug` §5 splits a large
   root cause into phase files and leaves the spec for `/spec-next`; there
   `Commit & Continue` is correct. The instruction is conditional on what the
   skill wrote, not static.
5. **Both skills, one spec.** `/spec-hotfix` §5b renders identically and a hotfix
   is single-pass by construction. Fixing one and not the other leaves the same
   press waiting on the release path, where it is worse.

## Solution overview

One new button set, declared by the two skills that produce single-pass work.

```js
// review.js
const BUTTON_SETS = ['committing', 'midrun', 'authoring', 'refresh', 'nospec', 'fix']

// page.html — OFFERS
fix: ['commit', 'changes', 'discuss'],

// serve.js
const NARROWING_SETS = ['midrun', 'refresh', 'fix']
```

```
# /spec-bug §5b, /spec-hotfix §5b
skitterspec spec-env review <spec> --buttons fix

# ...and, only where §5 split the fix into phase files:
skitterspec spec-env review <spec>
```

Nothing about the gate changes: both skills still `review arm`, and `commit` is
a committing verdict that discharges it. What goes is one verb that could never
be honoured.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Engine | update | `BUTTON_SETS` (+`fix`), `NARROWING_SETS` (+`fix`) |
| Review page | update | `OFFERS.fix` |
| Skill | update | `/spec-bug` §5b, `/spec-hotfix` §5b — declare `--buttons fix` |

No change to the pass blob, the verdict vocabulary, the gate or any stored
sidecar: `fix` offers a subset of verdicts that already exist.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The `fix` set exists, and survives a served re-render | ✅ | [01-fix-button-set.md](01-fix-button-set.md) |
| 2 | The two skills declare it | ⬜ | [02-skills-declare-it.md](02-skills-declare-it.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | Ready | backlog | Reuben Greaves |
| 2026-09-21 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-21 — Spec created, from a follow-up surfaced by `bug-note-editor`
  (SKS-378): the page for that fix offered `Commit & Continue` and the press
  reached a `/spec-next` with nothing to build.
- 2026-09-21 — Phase 1 done. The `NARROWING_SETS` entry was checked by reverting
  it: without `fix` on that list the CLI render is right and all three served
  tests go red, which is the refresh-is-wrong failure Decision 3 names.
