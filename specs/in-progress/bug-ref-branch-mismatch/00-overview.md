---
linear_identifier: "SKS-51"
linear_url: "https://linear.app/skitterbyte/issue/SKS-51/bug-spec-sync-ref-returns-the-branchs-ticket-not-the-commits"
---

# Bug: `spec-sync ref` returns the branch's ticket, not the commit's

> **Type:** Bug
> **Name:** bug-ref-branch-mismatch (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — fixed, tests green
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/linear/src/cli-sync.js, packages/linear/test/cli-ref.test.js, packages/linear/assets/rules/commit-trailers.md, packages/common/assets/skills/spec/SKILL.md
> **Stack:** worktree

## Symptom

Part-way through implementing `feat-walk-to-run-30` (branch `feat/walk-to-run-30`,
SKL-90), a design question warranted its own spec. `/spec` wrote
`feat-distance-prescriptions` into `specs/backlog/` and linked it as SKL-102.

Committing that new spec, `spec-sync ref` returned **SKL-90**. The commit
contained only `feat-distance-prescriptions` files and its base snapshot —
nothing belonging to SKL-90.

Repro:

1. On a spec branch with an in-progress spec (`feat/a` → TEAM-1)
2. Run `/spec`; let it write and link a new backlog spec (TEAM-2)
3. Stage only the new spec's files
4. `spec-sync ref` → **TEAM-1**

The inverse is correct: from `main` it says `branch main is not a spec branch —
no ticket to reference` and the trailer is rightly omitted.

`commit-trailers.md` says to get the ref from the engine, never read it off a
spec by hand and never invent one. Followed literally that stamps
`Refs: SKL-90` on a commit that is entirely SKL-102's work — which then
misreports in `spec-sync released <range>`, the exact thing the trailer exists
to make accurate. The reporter hand-wrote `Refs: SKL-102`, knowingly breaking
the rule because the alternative was worse. **The rule left no correct move —
that is as much the bug as the wrong output.**

## Root cause

`specSyncRef` (`packages/linear/src/cli-sync.js:983`) resolves the ticket from
the branch alone: it walks every bucket, matches `currentBranch` against
`branchFor(spec)`, and prints that spec's `linear_identifier`. Nothing in the
path looks at what is being committed.

Its own docblock states the intent — "the ticket this **branch's** work belongs
to" — so `ref` answers a different question than `Refs:` asks. The trailer is
about the commit's subject; `ref` is about the branch. They coincide only while
you are committing that branch's own implementation work, and `/spec` requires
no particular branch, so authoring a backlog spec mid-implementation makes them
diverge.

## Failing test (red)

`packages/linear/test/cli-ref.test.js` — seven tests for the explicit
`ref <spec>` form, run with `node --test packages/linear/test/cli-ref.test.js`.
The headline one reproduces the report directly:

```
✖ a named spec resolves to ITS ref, not the branch it is committed from
  AssertionError: the commit's spec, not feat/walk-to-run's SKS-90
  + actual - expected
  + 'SKS-90\n'
  - 'SKS-102\n'
```

The sharpest failure is a different one: `ref feat-no-such-spec` exits **0** and
prints the branch's ref today, so a typo'd spec name silently stamps the wrong
ticket rather than failing.

## Decisions

1. **`ref` keeps following the branch by default.** The override is explicit —
   `spec-sync ref <spec-name>`. Rejected inferring the spec from staged paths:
   it makes `ref` an accuser in the `negative-checks.md` sense, changing what
   gets stamped from a lookup that `git commit -a`, partial staging, or a spec
   touching shared code each blind — and the failure is silent and wrong. It
   also leaves mixed staging with no defined answer. An explicit override needs
   neither.
2. **The rule keeps its "always from the engine" spine.** Naming the spec is an
   engine call, so the fix does not add a hand-write carve-out to
   `commit-trailers.md` — it gives the disagreement case a command.
3. **`/spec` warns rather than refuses.** The reason to author from base is not
   only ref hygiene: a backlog spec written in another spec's worktree
   *physically lives on that branch*, so it is not on `main` until that spec
   lands, and dies with it if that spec is cancelled. A warning that names the
   consequence beats a block — the situation is legitimate when deliberate.
4. **The rule text ships in the package.** `.claude/rules/commit-trailers.md` is
   manifest-managed (`managedState`, `packages/common/src/init.js:147`): a local
   edit is classified `customized` and frozen out of upstream updates forever.
   A change shipped in a new package version resyncs cleanly against the
   recorded hash, so no `MANIFEST_VERSION` bump is needed.

## Fix

- [x] Add the failing tests for `ref <spec>` (red)
- [x] `specSyncRef` accepts an optional spec name: resolve it with
      `findSpecFolder` and print its `linear_identifier`, leaving the
      branch-derived default untouched. With a name given the branch is not
      consulted for resolution (so it works from `main`), and is reported in
      `--json` when determinable, `null` otherwise
- [x] Pass the positional through in the `case 'ref'` dispatch and document the
      form in the CLI help
- [x] Rewrite the `Refs:` section of
      `packages/linear/assets/rules/commit-trailers.md`: define the trailer by
      the commit's **subject**, not its branch, and give the disagreement case a
      defined answer (`spec-sync ref <spec>`)
- [x] Add a guard step to `packages/common/assets/skills/spec/SKILL.md` warning
      when a backlog spec is authored on another spec's branch, naming the
      hostage consequence
- [x] Failing tests now pass (GREEN); run the full suite — confirm no
      regressions

### Found in flight — `/spec-bug`'s own worktree step

Not the reported bug, but hit while fixing it, one clause away, and the same
class of mistake (`negative-checks.md`: git does not store empty directories).

- [x] `/spec-bug` §2 tells you to `mv` the spec stub into
      `<worktreePath>/specs/in-progress/`, which silently renames the spec folder
      **to** `specs/in-progress` whenever that bucket is empty on `main` and so
      absent from the fresh worktree. Add the `mkdir -p`, name the blind spot,
      and give the positive check to confirm against

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync ref [<spec>]` — optional spec name; bare form unchanged |
| Skill/rule | update | `.claude/rules/commit-trailers.md` — `Refs:` defined by commit subject |
| Skill/rule | update | `/spec` — warn when authoring a backlog spec on another spec's branch |
| Skill/rule | update | `/spec-bug` — `mkdir -p` the destination bucket before the stub `mv` |

No change to the projection, the snapshot format, or any push/apply path.
Additive: every existing `spec-sync ref` invocation resolves exactly as before.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Bug reproduced; seven failing tests added (red). The reported
  case reproduces exactly (`SKS-90` where `SKS-102` belongs); a typo'd spec name
  exiting 0 with the branch's ref was found alongside it.
- 2026-09-04 — Fixed: `spec-sync ref [<spec>]` resolves a named spec directly;
  rule and `/spec` guard updated. Full suite green (1108/1108, up from 1101).
- 2026-09-04 — Verified in both built distributions, not just source: the
  rewritten rule ships only in the Linear dist, the `/spec` guard in both.
  (`build-dist.js` overlays the provider's `rules` — the gap that hid
  `commit-trailers.md` entirely when it was first written.)
- 2026-09-04 — Verified end to end on this repo: from `bug/ref-branch-mismatch`,
  `ref feat-commit-ticket-refs` → `SKS-38` while the bare form still resolves
  this branch, and a typo'd name exits 1 instead of falling back.
- 2026-09-04 — Fixed in flight: `/spec-bug`'s §2 `mv` instruction produced the
  wrong layout when `specs/in-progress/` was absent from the fresh worktree
  (git stores no empty directories). Hit it on this very spec and repaired the
  nesting by hand. `/spec-hotfix` carries the identical instruction and is left
  untouched by request; `/spec-go` does not (it moves the spec inside the
  worktree, so there is no cross-checkout `mv`).
