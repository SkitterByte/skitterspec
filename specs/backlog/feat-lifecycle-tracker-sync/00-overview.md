# Sync the tracker on every lifecycle transition, not just `/spec-push`

> **Type:** Feature
> **Name:** feat-lifecycle-tracker-sync (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-08-30
> **Area:** packages/common (spec-complete, spec-cancel, spec-bug, spec-hotfix, spec-review skills), packages/linear (seam fragments)
> **Stack:** worktree

## Problem

Only `/spec-push` and `/spec-go` talk to Linear. Every other skill that changes a
spec's state changes it **on disk alone**, so the mirror goes stale and stays
stale until a human remembers to push. The workflow's whole promise — the tracker
is a generated mirror of the repo — holds only for as long as someone keeps
remembering.

Where the holes are today:

| Skill | State change | Tracker seam |
|-------|--------------|--------------|
| `/spec` | creates → Ready | intake · link · picker |
| `/spec-go` | Ready → In Progress | `spec-go-pull` (pushes) |
| `/spec-bug` | creates → In Progress | intake only — **never links** |
| `/spec-hotfix` | creates → In Progress | **none** |
| `/spec-complete` | → Complete | **none** |
| `/spec-cancel` | → Cancelled | **none** |
| `/spec-review` | rewrites content and phases | **none** |
| `/spec-to-main`, `/spec-live` | no status change | none needed |

The worst case is the terminal pair: a spec is finished, its folder is in
`specs/complete/`, and Linear says **In Progress indefinitely**. The second worst
is `/spec-bug` and `/spec-hotfix` — the specs created mid-incident, when nobody is
thinking about the tracker, are exactly the ones that never reach it.

Two things make this the right moment. `spec-sync apply` means a push is one
engine call with no model tokens, so syncing on every transition is now cheap
enough to do unprompted. And `spec-tracker-link` has drifted: it still walks the
agent through discovering MCP tools and creating issues by hand, so `/spec` links
the slow way while `/spec-push` takes the fast path.

## Decisions

1. **Push automatically and report afterwards — never prompt.** An offer the
   developer can decline is the same hole, quieter. The local operation is what
   was asked for; the mirror refresh rides along with it.
2. **A sync failure never blocks the local operation.** Completing, cancelling or
   reviewing a spec succeeds regardless — the repo is the source of truth and the
   mirror is disposable. Report the failure and carry on; the next push fixes it.
3. **Only refresh specs that already carry a `linear_identifier`.** An unlinked
   spec is skipped with a one-line note. Minting an issue that is `Done` on
   arrival is tracker noise, and it would surprise anyone deliberately keeping a
   spec local. Rejected: minting at completion "so the tracker is complete".
4. **Link on create for `/spec-bug` and `/spec-hotfix`**, matching `/spec`. These
   are creating skills, so linking is the *first* push, not a refresh — decision 3
   does not apply to them.
5. **One new fragment, reused.** `spec-tracker-sync` says "refresh the mirror if
   linked" and is injected at `/spec-complete`, `/spec-cancel` and `/spec-review`.
   The existing `spec-tracker-link` is reused for the two creating skills. Two
   fragments, five new seam sites — rather than five bespoke texts to drift apart.
6. **Marker placement carries the ordering.** In `/spec-complete` and
   `/spec-cancel` the seam sits **after the `git mv` and before the commit**:
   after, because the projection reads the spec's state from its folder bucket
   (`bucketFromPath`), so the push must see it already in `complete/`; before,
   because `apply` stamps ids and writes a snapshot under `specs/.core/`, and
   uncommitted changes make `spec-env integrate` refuse to land the branch.
7. **Modernise `spec-tracker-link` to `spec-sync apply` first**, before reusing it
   in phase 3 — otherwise the drift gets copied to two more skills.

## Solution overview

The seam mechanism already supports this: add `<!-- seam:NAME -->` to the skill in
`packages/common/assets/skills/`, drop `NAME.md` into
`packages/linear/assets/seams/`, and the build fills it for the Linear
distribution while the base distribution fills it with nothing. No engine change
and no new CLI surface — this is entirely composition.

The new fragment, in outline:

```markdown
**Only when `specs/.core/linear.config.json` exists** and the spec carries a
`linear_identifier`. No config, or no identifier → skip and say so in one line.

Run `/spec-push` now, without asking …
… a failure here never blocks the operation; say what failed and carry on.
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `/spec-complete`, `/spec-cancel` — seam before the commit |
| Skill/rule | update | `/spec-bug`, `/spec-hotfix` — link on create |
| Skill/rule | update | `/spec-review` — refresh after the rewrite |
| Skill/rule | add | `seams/spec-tracker-sync.md` |
| Skill/rule | update | `seams/spec-tracker-link.md` — use `spec-sync apply` |

No engine, CLI, config or projection changes. The base distribution is unaffected:
every new seam composes to nothing without a provider.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The sync fragment + terminal transitions | ⬜ | [01-terminal-transitions.md](01-terminal-transitions.md) |
| 2 | Modernise the link fragment to `apply` | ⬜ | [02-modernise-link.md](02-modernise-link.md) |
| 3 | Link on create, refresh after review | ⬜ | [03-create-and-review.md](03-create-and-review.md) |

## Open questions

- [ ] None.

## Depends on

- `feat-direct-api-apply` (complete) — decision 1 is only affordable because a
  push no longer costs model tokens.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-30 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-08-30 — Spec created. Audited every lifecycle skill against the seams it
  carries; found five with no tracker step, and pre-existing drift in
  `spec-tracker-link` (still MCP-by-hand, never updated for `spec-sync apply`).
- 2026-08-30 — Chose automatic push over an offer, because an offer preserves the
  thing being complained about: a step the developer has to remember.
- 2026-08-30 — Chose to skip unlinked specs at terminal transitions rather than
  mint a born-`Done` issue.
