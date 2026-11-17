---
github_identifier: "#210"
github_url: "https://github.com/SkitterByte/skitterspec/issues/210"
---

# Ideas — capture now, spec later

> **Type:** Feature
> **Name:** feat-spec-idea (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/210
> **Raised:** 2026-11-17
> **Area:** packages/common/src/idea.js (new), packages/common/src/cli.js, packages/common/assets/skills/spec-idea/ (new), packages/common/assets/skills/spec/SKILL.md, packages/common/src/tada/todo.js, packages/github/src/cli-sync.js, packages/github/src/config.js, packages/linear/src/cli-sync.js, packages/azure-boards/src/cli-sync.js, docs/
> **Stack:** worktree
> **Docs:** reference, github, linear, azure-boards

## Summary

`/spec-idea <text>` takes an idea for a spec out of your head and puts it
somewhere the team can see, in one step and with no grilling. You can list
ideas, throw them away, or turn one into a real spec with `/spec`. The
morning `/spec-todo` mentions how many are waiting.

## Problem

The only way into the workflow is `/spec`, and `/spec` grills until there is
a full spec. A passing thought can't take that much, so it is either specced
too early or lost. Writing it down somewhere doesn't fix this either: specs
are written on their own branch and worktree, so anything noted there is
invisible to the team until that branch lands. Ideas need one central place
that is cheap to write to and that `/spec` can pick up from.

## Acceptance criteria

- `/spec-idea Rate-limit the review server` files an idea and asks nothing.
- With GitHub configured it is an issue labelled `idea` and **not** on the
  board. With no provider it is an entry in `specs/ideas.md` on the base
  branch. In both cases the primary checkout is never left dirty.
- When the text is itself asking for design (questions, "suggestions
  welcome"), the skill offers `/spec` instead and still files the idea if the
  user declines.
- A bare `/spec-idea` lists the open ideas, each with the handle to use for
  promoting or discarding it.
- `/spec <idea-ref>` seeds the grill from the idea. Once the spec exists the
  idea leaves the list.
- `/spec-idea --drop <ref> [reason]` discards an idea: closed as not planned
  on the tracker, or removed from the file.
- `/spec-todo` prints one line, `N ideas waiting`, when there are any, and
  prints nothing when there are none or the count can't be read.
- If the tracker is unreachable, the idea is refused and its text is printed
  back. It is never quietly written to the file instead.

## Decisions

1. **One door, `/spec-idea`.** It is a skill that can be invoked by the
   model, with list and drop as modes of the same skill. Rejected: a
   separate `/idea` command, which would fall outside the `/spec-*` family.
2. **The tracker holds ideas when a provider supports them.** An idea is an
   issue carrying `intake.ideaLabel` (default `idea`), and it is kept off the
   board. The board is for specs, and a half-thought should not take up a
   column. The tracker is where the team already looks, it needs no git write
   and no land, and `/spec #N` (Phase 0) already adopts issues. Rejected: a
   repo file for everyone (every idea would need a land, and nobody sees it
   until it lands), and syncing both stores (that breaks one-way sync).
3. **With no provider, ideas go in `specs/ideas.md` on base.** It is a single
   append-only file. The engine lands each change through a throwaway
   `--docs` worktree with rebase + `merge --ff-only`, the lane `/spec` already
   uses, so `main` is never dirtied and the main guard has nothing to refuse.
   Rejected: a gitignored local file, which isn't shared.
4. **The file is used only when the provider positively can't hold ideas.**
   The provider must declare it by registering an idea store
   (`setProviderIdeaStore`, `supports: false` included); today Jira
   does not, because it has no intake. A provider that is configured but
   can't be reached is "cannot tell", so capture refuses and prints the text
   back. Otherwise one idea could land in each store
   (`.claude/rules/negative-checks.md` rule 4).
5. **Capture asks nothing, and judgement decides whether to say anything.**
   The first line is the title and the rest is the body. If the text is
   asking for design rather than recording a thought, the skill offers
   `/spec` once and files the idea on a decline. The grill belongs at
   promotion.
6. **Ideas are separate from intake.** `idea list` is its own listing and
   `/spec --from-issue` does not change. Intake holds reports filed by other
   people, and ideas are your own backlog of thoughts. Both drop out of their
   listing once `spec-sync linked` names them.
7. **Promotion reuses adoption.** A tracker idea is adopted by Phase 0 as it
   is today: its body is preserved as a comment and it becomes the spec issue.
   A file idea (`/spec idea:<id>`) seeds the grill and is dropped with
   `skitterspec idea drop` once the spec has been committed. That is never
   before the spec exists, and never as part of the spec's own commit.
8. **Discard means closed, not deleted.** On the tracker the idea is closed
   as not planned, with the reason as a comment. In the file the entry is
   removed and the reason goes in the commit body, so git keeps the history.

## Solution overview

`skitterspec idea <add|list|drop>` is the engine. It asks the idea store
the configured provider registered in-process. If the provider supports
ideas, the engine hands it the command. If it doesn't, or no
provider is configured, it uses the file store. The `/spec-idea` skill makes
the add-or-offer-`/spec` judgement and relays the result. `/spec` learns the
`idea:<id>` ref, and `todo` reads `idea list --count --json`.

```
## <id> · 2026-11-17 · Reuben Greaves
Rate-limit the review server
<optional body>
```

`<id>` is a short slug of the title, made unique within the file.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec idea add\|list\|drop` |
| Service | add | provider idea store via `setProviderIdeaStore` (github, linear, azure-boards; jira declares none) |
| Skill | add | `/spec-idea` |
| Skill | update | `/spec` — `idea:<id>` ref; idea label excluded from bug/hotfix routing |
| Skill | update | `/spec-todo` — `N ideas waiting` line |
| Config key | add | `intake.ideaLabel` (github, linear) · `intake.ideaTag` (azure-boards), default `idea` |
| File | add | `specs/ideas.md` (no-provider store) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine + file store, landed off base | ✅ | [01-engine-file-store.md](01-engine-file-store.md) |
| 2 | `/spec-idea` skill and `/spec` promotion | ✅ | [02-skill-and-promotion.md](02-skill-and-promotion.md) |
| 3 | GitHub idea seam | ✅ | [03-github-seam.md](03-github-seam.md) |
| 4 | Linear and Azure Boards seams | ✅ | [04-linear-azure-seams.md](04-linear-azure-seams.md) |
| 5 | `/spec-todo` line and docs | ✅ | [05-todo-and-docs.md](05-todo-and-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-17 — Spec created.
- 2026-11-17 — Phase 1: the file store lands by git plumbing instead of a
  throwaway worktree, so no checkout is touched and a moved base refuses
  instead of conflicting. Providers register an idea store in-process
  (`setProviderIdeaStore`) instead of answering `spec-sync idea --supports`.
  The `skitterspec idea` row was added to `docs/reference.html` now, because
  the site-coverage test requires it; the `covers` glob and the `verified:`
  bump stay in phase 5.
- 2026-11-17 — Phase 2: file-idea promotion drops the idea with
  `skitterspec idea drop` after the spec's committing verdict, instead of
  removing it in the authoring commit through `stage`. `stage` is unchanged,
  and the idea outlives a spec that was never written.
- 2026-11-17 — Follow-up surfaced: docs/index.html and docs/reference.html
  are stale against d2e25b39 (afterSwitch); not in scope here.
- 2026-11-17 — Completed; all phases done, tests green.
