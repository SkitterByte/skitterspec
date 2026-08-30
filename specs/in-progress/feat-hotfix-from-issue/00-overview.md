# Start a hotfix from a Linear issue

> **Type:** Feature
> **Name:** feat-hotfix-from-issue (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-08-30)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-30
> **Area:** packages/common (spec-hotfix, spec, spec-bug skills), packages/linear (intake seam, config, docs)
> **Stack:** worktree

## Problem

Production bugs arrive as Linear issues, but `/spec-hotfix` is the one spec-creating
skill that cannot adopt one. `/spec` and `/spec-bug` both carry the
`spec-tracker-intake` seam — `/spec SKI-123` turns an issue into a spec and makes
that issue the spec's issue. `/spec-hotfix` has no tracker seam at all, so the
person patching a released version retypes the report by hand and ends up with a
spec linked to nothing, or to a second issue that duplicates the first.

The gap is worse than an inconvenience because of *when* it bites: a hotfix is
written under time pressure, against a released tag, by whoever is on. That is the
worst moment to be copying a description between two windows.

There is also no signal that an issue **needs** a hotfix rather than an ordinary
fix. `intake.bugLabels` routes a bug-labelled issue from `/spec` to `/spec-bug`;
nothing routes a production issue to `/spec-hotfix`. Picking wrong means fixing on
`main` when prod needed patching — which is not discovered until someone asks why
the fix has not shipped.

## Decisions

1. **`/spec-hotfix` adopts an issue exactly as `/spec-bug` does** — the issue
   *becomes* the spec's issue, no second issue is minted, and the project picker
   is skipped because placement is Linear's. One intake fragment, now injected in
   three skills rather than two.
2. **The base tag is always confirmed, never inferred.** The skill scans the
   adopted issue for version-looking strings and *offers* them, but proceeds only
   on the user's answer. A reporter's version is often the one they noticed the
   bug on, not what is deployed, and a hotfix forked from the wrong tag is a bad
   failure that surfaces late. This keeps `/spec-hotfix`'s existing rule — "ask
   which version prod is running — don't guess" — intact.
3. **An issue-ref-shaped argument is a ref, never a name.** `/spec-hotfix <tag>
   <ref>`, `/spec-hotfix <ref>` (then ask for the tag), and `--from-issue [query]`
   all work. Names are kebab slugs; a ref is `LETTERS-DIGITS`, so the two cannot
   collide in practice. The tag stays required — asked for when absent.
4. **Add `intake.hotfixLabels`, mirroring `intake.bugLabels`.** An issue carrying
   one routes from `/spec` and `/spec-bug` to `/spec-hotfix` with the same
   "say so, name the label, stop" shape the bug routing already uses. Unset means
   nothing routes, exactly as `bugLabels` behaves today.
5. **Hotfix routing wins over bug routing.** An issue labelled both is a
   production bug: `/spec` sends it to `/spec-hotfix`, not `/spec-bug`. The more
   specific destination wins, and the cost of the wrong call is asymmetric —
   fixing on `main` when prod needed a patch is the expensive direction.
6. **Fix the "first `/spec-push`" drift while here.** `feat-lifecycle-tracker-sync`
   made the link seam apply at creation, so an adopted issue's description is now
   overwritten *then* — not on a later manual push. The intake fragment still says
   "the first `/spec-push` will overwrite the issue's description". The behaviour
   is right and was endorsed; the prose is stale and misleads on exactly the point
   a reporter cares about.

## Solution overview

```
/spec-hotfix v33.16.4 SKI-123     tag and issue given
/spec-hotfix SKI-123              adopt, then ask which version prod is running
/spec-hotfix --from-issue login   browse the intake inbox, filtered
```

Adoption seeds the spec's **Symptom** from the reporter's words and stamps
`linear_identifier`/`linear_url`, so the worktree, the failing test, the fix and
the eventual deploy tag all hang off the issue that reported it.

Routing, when an issue carries a `hotfixLabels` label:

```
This issue is labelled `production` — it needs a fix against a released
version, not main. Run: /spec-hotfix SKI-123
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `/spec-hotfix` — intake seam, argument grammar, tag prompt |
| Config key | add | `intake.hotfixLabels` |
| Skill/rule | update | `seams/spec-tracker-intake.md` — hotfix path, routing, stale prose |
| Skill/rule | update | `/spec`, `/spec-bug` — route a production-labelled issue |
| Docs | update | `linear.config.md`, example config |

No engine or projection changes: adoption is stamping an identifier the projection
already understands.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-hotfix` adopts an issue | ⬜ | [01-hotfix-intake.md](01-hotfix-intake.md) |
| 2 | Route production issues to it | ⬜ | [02-hotfix-routing.md](02-hotfix-routing.md) |
| 3 | Docs, and the stale adoption prose | ⬜ | [03-docs-and-drift.md](03-docs-and-drift.md) |

## Open questions

- [ ] None.

## Depends on

- `feat-lifecycle-tracker-sync` (complete) — it put the link seam in
  `/spec-hotfix`, so an adopted hotfix is pushed from creation. Decision 6 cleans
  up prose that change left stale.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-30 | Ready | backlog | Reuben Greaves |
| 2026-08-30 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-30 — Spec created. Corrects an earlier assessment: the argument-grammar
  "collision" recorded in `feat-lifecycle-tracker-sync` was overstated. Intake
  matches `LETTERS-DIGITS` refs, which real tags (`v33.16.4`) do not resemble; the
  only ambiguity is positional, and Decision 3 settles it in a sentence.
- 2026-08-30 — Chose to confirm the base tag always, offering what the issue says
  as a suggestion. Inferring it silently is the one failure here that is both easy
  and expensive.
- 2026-08-30 — Chose hotfix routing to win over bug routing on an issue carrying
  both labels, because the cost of the wrong call is asymmetric.
