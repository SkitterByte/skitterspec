---
github_identifier: "#317"
github_url: "https://github.com/SkitterByte/skitterspec/issues/317"
---

# Bug: resume dead-ends a spec whose only copy is on the base branch

> **Type:** Bug
> **Name:** bug-resume-base-only-copy
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/317
> **Author:** Reuben Greaves
> **Raised:** 2026-11-26
> **Area:** `packages/common/src/env/resume.js` (`planResume`), `packages/common/src/cli.js` (`specEnvResume`), `/spec-resume` SKILL.md
> **Docs:** reference

## Symptom

Reported from ereqs (23.24.5, `mode: worktree`, `land.specDocs` branch,
`guards.mainIsLandingZone: true`), run from the primary checkout on `main`:

```
skitterspec spec-env resume feat-event-sourced-notifications --json
{ "ok": false, "bucket": "in-progress", "source": "here",
  "branch": "feat/event-sourced-notifications",
  "worktree": { "present": false },
  "refused": "… has no worktree and no feat/event-sourced-notifications branch here or on origin — nothing to resume from" }
```

No offer. The spec is in `specs/in-progress/` on `main`; its earlier phases
were built on branches that merged, and its own branch is gone locally and
from origin. All of its code is on `main`. `/spec-resume` refuses,
`/spec-start` refuses an in-progress spec, `/spec-next` needs a worktree and
main-guard refuses edits on the base — so only `/allow-main` gets anyone in.
1 of 7 in-progress specs in ereqs.

## Root cause

`planResume` (`packages/common/src/env/resume.js`, the no-branch `else`)
refuses whenever no local or remote branch exists, on the reasoning that a
fork from the base "would hand back an empty tree with the spec's work out of
reach". That holds for a copy read off a branch or a worktree. It is false for
a copy read off the base branch itself (`source: "here"`, checkout on the
base): a fork at the base holds everything that copy describes — the same
reasoning `planReopen` already applies to completed specs.

## Failing test (red)

`packages/common/test/env-resume.test.js` — *a base-branch copy with no branch
anywhere re-attaches at the base, create-then-up*: expects `ok: true` and
`commands: ['git branch feat/x main', 'skitterspec spec-env up feat-x']`.

```
✖ a base-branch copy with no branch anywhere re-attaches at the base, create-then-up
  AssertionError: Expected values to be strictly equal: actual: false, expected: true
```

## Fix

- [x] `planResume`: with no branch anywhere, a copy from `here` while the
      checkout stands on the base plans `git branch <branch> <base>` (no `-f`)
      then `spec-env up <spec>`, `then: []` — the `--reopen` shape. Anything
      else keeps the refusal with no offer.
- [x] `specEnvResume` passes `base` and `onBase` (`HEAD` names the base; a
      detached HEAD or git error reads as no).
- [x] Tests: the accusing case; stays-silent for a worktree/branch copy, an
      off-base or unknown checkout and an unresolved base; unchanged attach
      for a leftover local or remote branch; a real-git CLI case (merged and
      deleted branch on `main`, then detached).
- [x] `/spec-resume` SKILL.md §2 describes the new plan; `reference.html`
      updated and stamped.
- [x] Failing test now passes (GREEN); `pnpm build` and `pnpm test` green.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env resume` — base-only copy plans a branch at the base |
| Skill/rule | update | `/spec-resume` §2 — the re-create-at-base plan |

## Changelog

- 2026-11-26 — Bug reproduced; failing test added (red).
- 2026-11-26 — Criterion 3 (refuse over a leftover branch with unmerged
  commits) holds by construction: the new plan runs only when no branch
  exists, and a branch that does exist is attached as before, never reset.
  The created branch uses plain `git branch`, so one appearing after the plan
  makes git refuse rather than overwrite.
- 2026-11-26 — Chose `ok: true` over a satisfy offer: the plan loses nothing
  and is the attach the operator asked for. `CHANGELOG.md` is frozen, so the
  user-facing entry is the commit's `Release-Note:`.
- 2026-11-26 — Fixed: base-only copy re-attaches at the base; test green.
