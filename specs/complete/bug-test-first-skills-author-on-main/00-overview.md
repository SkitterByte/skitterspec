# Bug: the test-first skills author on the base branch

> **Type:** Bug
> **Name:** bug-test-first-skills-author-on-main (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-22)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-22
> **Area:** `packages/common/assets/skills/spec-bug`, `packages/common/assets/skills/spec-hotfix`, `packages/common/src/cli.js`

## Symptom

`/spec-bug`, run in a project with isolation configured and the main guard
installed, is **denied on its own documented first step**. The skill's §2 says:

> From the base branch (`main`), create `specs/in-progress/bug-<name>/00-overview.md`
> with just the header block and the `## Symptom` you established above.

which is a `Write` in the primary checkout while it is on the base branch —
exactly what `.claude/hooks/main-guard.cjs` refuses:

```
Error: spec-env main: the primary checkout is on the base branch, and the base
branch is a landing zone — work lands there, it does not happen there.
```

Observed in a downstream project: the run recovered by hand-provisioning with
shell commands and carried on, so the fix still happened — but the happy path
dead-ends on the repo's own hook, and what recovers it is improvisation rather
than the skill.

`/spec-hotfix` §3 carries the identical instruction and fails the same way.

## Root cause

Scope, not design. `feat-main-is-a-landing-zone` converted `/spec` to the
authoring lane in phase 2 and shipped the guard in phase 4, but never converted
the two **test-first** skills, which were seeding stubs the same way:

- `packages/common/assets/skills/spec-bug/SKILL.md:53`
- `packages/common/assets/skills/spec-hotfix/SKILL.md:63`

The engine was never the problem. `specEnvUp`'s authoring branch
(`packages/common/src/cli.js:863`) opens on a `SPEC_NOT_FOUND`, `--docs`, and a
name matching `^(feat|bug|hotfix)-.` — so it has accepted `bug-` and `hotfix-`
from the day it shipped. Only the skills never asked.

`/spec-hotfix` has one extra difficulty that `/spec-bug` does not, and it is why
this is two phases. Its worktree forks from a **release tag**, and the engine
learns that tag from the spec's own `> **Base version:**` header — which does
not exist yet at the moment the lane runs. `resolveSpecless` carries no base
ref, so an authoring-lane hotfix would fork from `main` and silently fix the
wrong code. The tag has to reach the engine on the command line.

## Failing test (red)

`packages/common/test/assets-test-first-authors-in-worktree.test.js` —
asserts `/spec-bug` provisions with `spec-env up bug-<name> --docs` before it
writes, that the base-branch instruction is gone, that the session moves and
confirms the move, and that the flagless `up` runs afterwards so the `setup`
commands happen. Phase 2 adds `/spec-hotfix` and the engine's `--from`.

```
node --test packages/common/test/assets-test-first-authors-in-worktree.test.js
```

Red before the fix, 7 of 8 failing:

```
✖ /spec-bug provisions a docs worktree before it writes the stub
✖ the stub is no longer seeded on the base branch
✖ the flagless up runs afterwards, so the setup commands happen
```

The eighth is the stays-silent check (`negative-checks.md` rule 3) — a project
with no isolation must be untouched by all of this — and it passes throughout.

## Fix

Phased: two skills, and the second needs an engine flag the first does not.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-bug` takes the authoring lane | ✅ | [01-spec-bug-authoring-lane.md](01-spec-bug-authoring-lane.md) |
| 2 | `/spec-hotfix`, and forking from a tag it has not written down yet | ✅ | [02-hotfix-forks-from-a-tag.md](02-hotfix-forks-from-a-tag.md) |

Phase 1 needs no engine change at all — it is `/spec` + `/spec-start`'s proven
shape, with the deferred `setup` pulled forward because a bug has no
`/spec-start` to defer it to. Phase 2 is where the engine gains `--from <tag>`,
so it ships second and on its own evidence.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | update | `/spec-bug` §2, §4 — provision before writing, in the worktree |
| Skill | update | `/spec-hotfix` §3 — same, plus the tag on the command line |
| CLI flag | add | `spec-env up <spec> --docs --from <ref>` (phase 2) |
| Engine | fix | `specEnvUp` no longer crashes on the flagless re-run of a document-less spec |
| Engine output | update | the authoring lane's `authoring:` line names the skill that asked, not `/spec` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-22 | In Progress | in-progress | Reuben Greaves |
| 2026-09-22 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-22 — Completed; both phases done, tests green (3559).
- 2026-09-22 — Fixed (phase 2): `spec-env up` gained `--from <ref>` for the
  authoring lane, and `/spec-hotfix` provisions from the tag and writes the spec
  in that worktree — the hand-move and its hazard paragraph are gone. Suite
  green, 3559 passed.
- 2026-09-22 — Found while testing phase 2: the flagless re-run **crashed** for
  a spec with no document (`specIsUntracked` on a null path), because the guard
  asked `authoring` rather than whether a document exists. Both skills run that
  command, so phase 1 had shipped an instruction that could not run. Fixed and
  covered.
- 2026-09-22 — Fixed (phase 1): `/spec-bug` provisions with
  `spec-env up bug-<name> --docs`, moves the session in, and writes the spec
  there; the flagless `up` follows for the `setup` commands. Suite green,
  3546 passed.
- 2026-09-22 — Bug reproduced; failing test added (red). Split into two phases:
  the engine already accepts `bug-` in the authoring lane, so `/spec-bug` is
  prose only, while `/spec-hotfix` needs a fork ref the spec file cannot yet
  supply.
