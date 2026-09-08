---
linear_identifier: "SKS-71"
linear_url: "https://linear.app/skitterbyte/issue/SKS-71/bug-spec-bug-and-spec-hotfix-reference-a-section-never-composed-into"
---

# Bug: /spec-bug and /spec-hotfix reference a section never composed into them

> **Type:** Bug
> **Name:** bug-dangling-project-picker-ref
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-08
> **Stack:** worktree
> **Area:** `packages/common/assets/skills/{spec-bug,spec-hotfix}/SKILL.md`

## Symptom

Both `/spec-bug` and `/spec-hotfix` instruct the reader:

> 2. **Pick the Project** — run the picker in **Picking the Linear Project** below.
>    Keep the chosen id for step 4.

That section never appears in either skill. Measured on the composed
distribution before the fix:

| Skill | References the picker | Section defined |
|-------|----------------------|-----------------|
| `/spec` | 1 | **1** |
| `/spec-push` | 1 | **1** |
| `/spec-bug` | 1 | **0** |
| `/spec-hotfix` | 1 | **0** |

Found by hitting it: while running `/spec-bug` for SKS-70, the picker step led
nowhere. Worked around there by falling back to the configured default
`linear.projectId` — which is a reasonable default, but not what the skill said
to do, and an agent with no such config has nothing to fall back to.

## Root cause

The prose that *points* at the picker and the marker that *delivers* it live in
different places, so they drifted apart:

- The pointer comes from the **shared** fragment
  `packages/linear/assets/seams/spec-tracker-link.md`, injected into every skill
  that links a spec — `/spec`, `/spec-bug`, `/spec-hotfix`.
- The section itself arrives via `<!-- seam:spec-project-picker -->`, a marker
  **each skill must carry for itself**. Only
  `packages/common/assets/skills/spec/SKILL.md:252` and
  `packages/linear/assets/skills/spec-push/SKILL.md:243` had it.

So adding the shared pointer to a skill silently promised a section that skill
never received. Composition succeeds either way — a skill with no marker simply
has no section — which is why this shipped unnoticed.

## Failing test (red)

`scripts/build-dist.test.js` — *"no composed skill points at a section it does
not define"*: builds the superset distribution, scans each composed `SKILL.md`
for `**Name** below` cross-references, and asserts a matching heading exists in
that same file.

Run: `node --test scripts/build-dist.test.js`

```
✖ no composed skill points at a section it does not define
  AssertionError: dangling cross-references:
    spec-bug → "Picking the Linear Project", spec-hotfix → "Picking the Linear Project"
```

It named the two offenders and **nothing else** — the other skills passed, which
is the stays-silent property built into the assertion rather than bolted on.

## Fix

- [x] Add `<!-- seam:spec-project-picker -->` to
      `packages/common/assets/skills/spec-bug/SKILL.md` and
      `.../spec-hotfix/SKILL.md`, directly after their existing
      `<!-- seam:spec-tracker-link -->` — the same order `/spec` and `/spec-push`
      already use, so the link steps are followed by the picker they point at.
- [x] Guard it with the red test above, in `scripts/build-dist.test.js` beside
      the existing seam guards.
- [x] Failing test now passes (GREEN); full suite **1332 passing, 0 failing**
      (564 linear, 420 common, 212 sync-core, 136 scripts).
- [x] Confirmed on composed output: all four skills now report
      `references=1 section-defined=1`, and the base distribution still reports
      `0` — it stays tracker-free.

### Why the guard is the inverse of the one already there

`build-dist.test.js` already had *"every seam referenced by a skill has a
fragment to fill it"* — marker → fragment. It cannot see this bug, because there
was no marker to check: the failure is prose pointing at a section no marker ever
brought in. The new guard runs the other direction, over the **composed** output
rather than the sources, since that is the artefact a reader actually gets.

It asserts a **positive** signal — the heading must be present — rather than
scanning for known-bad phrasings, so a new dangling cross-reference in any skill
is caught without anyone extending a list.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `/spec-bug` — gains the `spec-project-picker` seam |
| Skill/rule | update | `/spec-hotfix` — gains the `spec-project-picker` seam |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-08 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-08 — Found while running `/spec-bug` for SKS-70; reproduced as a
  composed-output guard in `scripts/build-dist.test.js` (red, naming both
  offenders).
- 2026-09-08 — Fixed: both skills now carry the picker seam; test green.
