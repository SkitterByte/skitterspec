# A rule for checks that accuse, and an audit against it

> **Type:** Feature
> **Name:** feat-negative-checks-rule (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/common/assets/rules/negative-checks.md (new), packages/sync-core/src, packages/common/src/init.js, packages/linear/src/doctor.js
> **Stack:** worktree

## Problem

The same defect shipped three times on 2026-09-02, in three unrelated places:

| Check | Absence observed | Concluded | Why the lookup was blind |
|-------|------------------|-----------|--------------------------|
| ref existence (hand-run) | not in `team.issues` | "does not exist" | excludes archived, caps at 250 |
| npm publish verification | not in `versions` | "publish failed" | the registry is eventually consistent |
| `doctor`'s scaffold row | directory not on disk | "half-installed" | git cannot store an empty directory |

Each inferred a **negative from an absence** without establishing that the
absence meant anything, then acted confidently on it: accuse 146 healthy refs,
delete a valid release tag, exit non-zero on a healthy repo.

skitterspec is largely made of checks that accuse — `doctor`, `spec-sync status`,
`verify`, `retarget`'s rename detection, `lintPhases`, `init`'s resync classifier.
The failure is native to the product, so it will keep recurring until the
codebase has an explicit position on it.

## Decisions

1. **The rule ships**, in `packages/common/assets/rules/`, so it installs into
   every consumer's `.claude/rules/` beside `spec-planning.md`. Rejected keeping
   it local: this tool's users write checks against their own repos, and the base
   is where the shared conventions already live. `listRules()` discovers the
   directory, so nothing else needs editing.
2. **Prefer a positive signal over an absence.** Assert something that must
   exist (`specs/.core/`) rather than something that must not be missing (a
   lifecycle bucket). This is what actually fixed
   [bug-scaffold-empty-buckets](../complete/bug-scaffold-empty-buckets/00-overview.md),
   and it generalises: a positive signal fails loudly when wrong, an absence
   fails silently when the lookup is limited.
3. **Name what would blind the lookup, beside the check.** Each of the three was
   knowable in advance — the pagination cap, the registry's consistency model,
   git's treatment of empty directories. A comment naming the blind spot is what
   makes the next reader check it.
4. **Every accusing check carries a paired negative test** — proof it stays
   silent on a healthy-but-unusual input. This is the enforceable half, and it
   would have caught all three. Rejected relying on prose alone: the rule with no
   test is the state we were already in.
5. **Bias the unknown case toward inaction.** `managedState`
   (`packages/common/src/init.js:148`) already does this — a file whose hash is
   not in the manifest reads as `customized`, so resync **keeps** it. The rule
   cites it as the in-repo example of the correct shape, rather than inventing
   one.
6. **The audit is scoped to checks that ACCUSE**, not every conditional. A check
   qualifies when a false positive causes a destructive act, a non-zero exit, or
   a claim about the user's repo being wrong.

## Solution overview

A shipped rule, then an audit of the existing checks against it.

The rule is short and states four things: prefer a positive signal; name the
blind spot; pair every accusation with a stays-silent test; bias the unknown
toward inaction. Each point carries the real incident that earned it.

The audit inventory, and what a false positive costs today:

| Check | Where | Cost of a false positive |
|-------|-------|--------------------------|
| `lintPhases` | `sync-core/src/normalize.js:420` | warns on every read of a healthy spec |
| `compareStored` | `sync-core/src/verify.js` | reports a mirror corrupt when it is intact |
| retarget detection | `sync-core/src/retarget.js` | rewrites stamps under a wrong key |
| `managedState` / resync | `common/src/init.js:148` | clobbers or refuses a user's edits |
| `doctor` rows | `linear/src/doctor.js` | exits 1; a skill branches on it |

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | add | `.claude/rules/negative-checks.md` (ships via common assets) |
| Business rule | update | each accusing check gains a stays-silent test |

No CLI, config or output changes — the audit adds tests and comments, and only
changes behaviour where a check is found to accuse wrongly.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Write and ship the rule | ✅ | [01-rule.md](01-rule.md) |
| 2 | Audit the sync-core checks | ⬜ | [02-audit-sync-core.md](02-audit-sync-core.md) |
| 3 | Audit init and the doctor rows | ⬜ | [03-audit-init-doctor.md](03-audit-init-doctor.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | Ready | backlog | Reuben Greaves |
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-02 — Spec created after the same defect shipped three times in one day.
- 2026-09-02 — Phase 1: the rule ships as `negative-checks.md` and needed no
  manifest edit, as expected. Added two guards rather than one — the install
  assertion the phase called for, plus a content test on the rule's four
  headings, since Phases 2–3 audit against those headings by name. Also noted
  the new rule in the base README's installed-tree listing, which named
  `spec-planning.md` as the only installed rule.
