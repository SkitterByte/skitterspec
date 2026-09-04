---
linear_identifier: "SKS-63"
linear_url: "https://linear.app/skitterbyte/issue/SKS-63/bug-the-shipped-claudemd-section-is-stale-and-unguarded"
---

# Bug: the shipped CLAUDE.md section is stale and unguarded

> **Type:** Bug
> **Name:** bug-stale-claude-md (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — fixed (test green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/common/assets/claude-md-section.md, packages/common/test/assets-claude-md.test.js, CLAUDE.md
> **Stack:** worktree

## Symptom

`installClaudeMd` writes `packages/common/assets/claude-md-section.md` into every
consumer's `CLAUDE.md` between markers, so its claims are shipped content. Four
had gone stale, three of them today:

- `/spec-connect` described as a skill, and folded into the everyday loop as one.
  It became a **command** in `feat-script-only-commands`.
- "seven lifecycle skills" — the rules describe nine, and the table omitted
  `/spec-hotfix` and `/spec-to-main` entirely.
- `spec-env <up|down|dev|connect|integrate>` — five verbs of the ten dispatched.
- `/spec-live` unmentioned anywhere.

This repo's own `CLAUDE.md` carried the block byte-for-byte, which is how it was
noticed: it was still untracked, and checking it in would have committed the
stale text.

## Root cause

Nothing checks this asset. `scripts/docs-claims.test.js` guards exactly these
failure modes — naming a skill that does not ship, quoting a verb list that has
moved on — but its `PAGES` list is `docs/index.html` and `docs/linear.html`. The
CLAUDE.md section is the same kind of claim, shipped to more places, and was
never added to any guard.

So the drift is not an oversight by one author; it is the predictable result of
having no check at all. Every skill rename and every engine change since the file
was written could have broken it silently, and several did.

## Failing test (red)

`packages/common/test/assets-claude-md.test.js` — run with
`node --test packages/common/test/assets-claude-md.test.js`. Before the fix:

```
✖ the section does not call a command a skill
  AssertionError: /spec-connect is a command, but the section groups it with the skills
✖ any spec-env verb list is complete, or absent
  AssertionError: the section lists spec-env <up|down|dev|connect|integrate>
  but the engine also has: prune, hotfix, status, resolve, live
```

A third check — every `/spec-…` named must ship as a skill or command — caught a
false positive of its own first: it read `/spec-planning` out of the path
`.claude/rules/spec-planning.md`. Fixed with a `(?!\.md)` guard before the real
failures were trusted.

## Fix

- [x] Add `packages/common/test/assets-claude-md.test.js`: a readable-catalogue
      precondition, every `/spec-…` must ship, no command may be grouped with the
      skills, and any `spec-env <…>` verb list must be complete or absent.
- [x] Rewrite the stale claims in `packages/common/assets/claude-md-section.md`:
      drop the skill/command confusion, add `/spec-hotfix` and `/spec-to-main` to
      the table, add a **Skills vs commands** note, mention `/spec-live`, and
      replace the truncated verb list with all ten plus the zero-arg behaviour.
- [x] Regenerate this repo's `CLAUDE.md` from the corrected asset and **track it**
      — it had never been committed.
- [x] `pnpm test` — **1276 green**; `pnpm build` composes both distributions.

## Deliberately not done

Running `update` also scaffolded four missing `specs/.core/` templates
(`SETUP.md`, `ci-stages.md`, `linear.config.json.example`, `linear.config.md`).
Whether this repo should track the scaffolded templates is a separate question
from this bug, so they are not committed here.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `claude-md-section.md` — skills/commands split, full verb list |
| Repo config | add | `CLAUDE.md` now tracked, regenerated from the asset |
| Test | add | `assets-claude-md.test.js` guards the shipped section |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Bug reproduced; failing test added (red).
- 2026-09-04 — Fixed: section corrected, CLAUDE.md regenerated and tracked.
