---
linear_identifier: "SKS-360"
linear_url: "https://linear.app/skitterbyte/issue/SKS-360/bug-a-served-docs-page-loses-its-authoring-buttons"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: a served docs page loses its authoring buttons

> **Type:** Bug
> **Name:** bug-served-docs-page-loses-authoring (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** `packages/common/src/env/serve.js`

## Symptom

A spec authored by `/spec` is served as a **worktree** view rather than a
**docs** view, so its page offers the committing set — `Commit & Continue` —
instead of the authoring set `Commit & Start` / `Commit`.

`commit-continue` means *commit, then build the next phase*. A backlog spec has
no phase in flight, so it is a verdict that page must not be able to send.

Observed today on `feat-offer-the-unblock`: a reader pressed **Commit &
Continue** on its authoring page and the pass came back carrying that word. The
two halves disagree and only one is wrong:

```
CLI-written file:  "buttons":"authoring"      ← correct
served copy:       "mode":"working", no buttons key   ← the committing default
```

This is the second time this exact sentence has been written here. The header of
`packages/common/test/env-serve-buttons.test.js` records the first: specless
branches served the committing set, *"a reader pressed one and the pass came
back `commit-continue` — a word the page they were looking at could not
produce."*

## Root cause

`viewFor` (`packages/common/src/env/serve.js:208`) tests for a worktree **before**
it tests for documents:

```js
if (wt && wt !== dir && fs.existsSync(wt)) return { kind: 'worktree', tree: wt }
const found = specDocsIn(dir, spec, config, trimmedGitReader(dir))
if (!found.empty) return { kind: 'docs', tree: found.tree, owned: found.owned }
```

`/spec` used to write into the primary checkout, so a backlog spec had **no
worktree** and the docs branch was reachable. Since `/spec` began provisioning
each spec's own `--docs` worktree, that branch is unreachable for exactly the
specs it exists to serve. `buttonsForView` (`serve.js:405`) then sees viewKind
`worktree` rather than `docs` and falls through to `DEFAULT_BUTTON_SET`.

The second half of the same mistake: the docs check reads `dir` — the **primary
checkout** — which was where the documents lived before the change and is not
where they live now.

Only the daemon's re-render is affected. The CLI path resolves its tree from
where the operator is standing (`resolveSpecDocs`, `cli.js:2027`) and is correct.

## Failing test (red)

`packages/common/test/env-serve-buttons.test.js` — two tests added to the file
that already covers this bug's first incarnation, plus a fourth fixture family:
a backlog spec whose documents are uncommitted in its own `--docs` worktree.

    ✖ a spec authored in its own --docs worktree is served the authoring buttons
    ✖ an authored page offers Commit & Start, and never Commit & Continue

Run: `node --test packages/common/test/env-serve-buttons.test.js`

Three **stays-silent** tests went in beside them and all three passed before the
fix — which is the point of them, because the naive fix is to move the docs
check above the worktree check and that would serve every in-flight spec its
documents instead of its code.

## Fix

- [x] Add `docsWorktree(wt, spec, config)` — a **positive signal**
      (`.claude/rules/negative-checks.md` rule 1) asked of the worktree itself,
      returning the owned paths or `null`.
- [x] `viewFor` consults it before settling for `worktree`, and returns
      `{ kind: 'docs', tree: wt, owned }` when it answers.
- [x] Failing tests now pass (GREEN); full suite green — 3393 passed,
      `npm test`; `npm run build` green and re-verified.
- [x] Follow-up hardening: none needed here — see Follow-ups below for the
      separate re-render issue, which is not this root cause.

## Decisions

1. **It takes both halves, and each guards a different mistake.** The spec must
   be in the **backlog** *and* the worktree must hold nothing but its own
   documents.
   - Bucket alone is not enough: a backlog worktree used for anything else would
     have that work rendered under an authoring verdict.
   - Documents-only alone is not enough either, and this is the subtle one. Right
     after `/spec-start` the `git mv` between buckets and the header edit are
     uncommitted and no phase code exists yet — and **both sides of a `git mv`
     classify as `owned`**, so that window reads as documents-only and would
     offer `Commit & Start` for a spec already in flight.

2. **Every cannot-tell stays a worktree view.** An unresolvable bucket, a git
   that will not read, an empty tree — all fall through to the behaviour that was
   there before (rule 4). Being wrong that way costs one page the narrowing it
   would have had; being wrong the other way is the defect itself.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Engine | add | `docsWorktree()` in `env/serve.js` |
| Engine | update | `viewFor` resolves a docs worktree before a code worktree |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-18 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-18 — Bug reproduced; failing test added (red).
- 2026-09-18 — Fixed: `viewFor` resolves a docs worktree before a code
  worktree, keyed on backlog + documents-only; tests green.
