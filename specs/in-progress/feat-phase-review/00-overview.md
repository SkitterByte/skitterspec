---
linear_identifier: "SKS-138"
linear_url: "https://linear.app/skitterbyte/issue/SKS-138/see-the-phase-before-you-commit-it"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# See the phase before you commit it

> **Type:** Feature
> **Name:** feat-phase-review (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-11)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-11
> **Area:** packages/common/src/cli.js, packages/common/src/env/review.js (new), packages/common/assets/review/ (new), packages/common/assets/skills/spec-diff/ (new), packages/common/assets/skills/spec-next/SKILL.md, packages/common/assets/core/env.config.md, packages/common/test, docs/index.html
> **Stack:** worktree

## Problem

A phase is built in its own worktree and you cannot see what it did. The terminal
sits in the primary checkout, so `git diff` and any git UI answer about `main`;
and reading a 350-line diff as terminal text is not review, it is scrolling.

Two specs have already been cancelled trying to fix this from the wrong end.
`feat-spec-diff` (SKS-82) opened a viewer **tab**; `feat-spec-start-opens-tab`
(SKS-121) moved the **shell** into one. Both assumed the diff must be shown by a
terminal program, which forces a tab, which is unreachable from a phone.
`feat-lazygit-commits` (SKS-134) then assumed the answer was a *better* terminal
program. It is not: Claude Code owns the terminal, so no TUI can live inside it,
and the requirement was never "reach a git UI" — it is **see what this phase
changed, and judge it, before committing**.

## Decisions

1. **Render the diff, don't run a program over it.** The engine writes a
   self-contained HTML page; you open it locally, or publish it and read it on a
   phone. Nothing depends on the shell's cwd, so nothing breaks on mobile.
   *Rejected:* a tab (SKS-82, SKS-121), a TUI (SKS-134) — all three cancelled.
2. **The data never passes through the model.** git writes the patch to a file
   and the engine splices it into the page. Measured on the prototype: 266KB of
   patch data cost **zero** context tokens, and the finished 289KB page costs the
   same to publish as a 5KB one. This is the property the whole design rests on —
   do not "simplify" it into the model reading the diff and emitting HTML.
3. **Whole-file context, collapsed.** Patches are generated with a very large
   `-U`, so a file's patch *is* the file; the renderer shows four lines either
   side of a change and collapses the rest into bands that expand. Reviewing a
   changed line needs the code around it, and this costs a git flag rather than a
   second read. Files over 400KB fall back to `-U3` rather than bloating the page.
4. **Untracked files are part of the review.** `git diff` cannot see them at all,
   so a new test file would be invisible — exactly the file most worth reading.
   They come in via `--no-index` against `/dev/null` and are marked `new`.
5. **Read the worktree from wherever you are.** All collection is
   `git -C <worktreePath>`; the worktree is never entered and no cwd changes.
   Verified on the prototype from the `main` checkout, against a real linked
   worktree with uncommitted work.
6. **The engine renders; the model judges.** The skill writes a small JSON review
   (a few paragraphs plus severity-tagged checks) and the engine splices it in.
   *Rejected:* the model emitting HTML (more tokens, easy to break the page) and
   the engine parsing markdown (a markdown renderer to ship and maintain for one
   surface).
7. **The page is written to a gitignored path by default** —
   `.spec-env/reviews/<spec>.html`. No gallery entry, no publish, works offline,
   costs nothing. On a desktop that is the whole feature.
8. **Publishing is a deliberate act, one artifact per spec.** Re-publishing the
   same path keeps the same URL, so each phase updates that page under a version
   label rather than adding a row. The URL is remembered in `.spec-env/`
   (gitignored) — **not** in the spec's frontmatter, because a published page is
   private to whoever published it and a committed link would advertise access
   teammates do not have. Publishing also cannot be undone by the tooling, which
   is its own argument for stinginess.
9. **The prose is opt-in; the page is not.** `/spec-next` generates the page at
   the end of a phase (engine only, no model tokens) and **offers** the written
   review rather than writing it unasked — that is the part that costs, measured
   at ~700 output tokens, and the spend is the operator's call.
10. **`/spec-diff` answers at any point, not only at a phase boundary.** Half a
    phase, a hand edit, a spec someone else is building — all are ordinary
    inputs. It is gated on **nothing**: not on tests passing, not on the phase
    being finished, not on the spec being the session's. Reviewing work in
    progress is the common case, and a gate would refuse exactly when you most
    want to look.
11. **MVP stance: one user, so removal is cheap and compatibility is not a
    goal.** No migration notes, no deprecation window, no config key kept alive
    for a hypothetical install. Where a constant will do, it is a constant.
12. **Once this ships, the tab machinery goes.** `open.command` and the
    `EnterWorktree` branching in `/spec-start` exist only to move a shell or open
    a terminal, and every spec that relied on them is cancelled. Starting a spec
    becomes: build the worktree, print the path. Reviewing it becomes
    `/spec-diff`. *Kept:* worktree trust (it stops edit prompts, nothing to do
    with tabs) and `spec-env connect` / `/spec-live` (they reach a running app,
    not a shell).
13. **It degrades to the file.** A harness that cannot publish still gets the
    local page and says so. Nothing in the engine knows what an artifact is.

## Solution overview

```
/spec-next                     phase built, tests green
                               → .spec-env/reviews/feat-x.html written (0 tokens)
/spec-diff                     → Claude reads the phase's own diff (already in
                                 context), writes the review JSON, re-renders,
                                 and offers to publish
                               → same URL as last phase, labelled "phase-3"
/commit                        unchanged
```

The engine verb, with the two shapes a review needs:

```
skitterspec spec-env review <spec>              # uncommitted work vs HEAD
skitterspec spec-env review <spec> --branch     # everything since the base branch
  [--out <file>] [--review <json>] [--json]
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env review [spec] [--branch] [--out] [--review] [--json]` |
| Asset | add | `packages/common/assets/review/` — the page template (HTML/CSS/JS) |
| Skill | add | `/spec-diff` — writes the review, renders, offers to publish |
| Skill | update | `/spec-next` — generates the page when a phase ends |
| Local state | add | `.spec-env/reviews/<spec>.html`, `.spec-env/reviews/<spec>.url` |
| Docs | update | `env.config.md` + `docs/index.html` — the review loop |
| Config key | remove | `open.command` — the opener, with no replacement |
| Skill | update | `/spec-start` — one path: provision, print the path |
| Skill/rule | update | `spec-planning.md` — `worktree` mode no longer moves the session |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Collect a worktree's diff, and emit a page | ⬜ | [01-collect-and-emit.md](01-collect-and-emit.md) |
| 2 | The viewer — context bands, file tree, both themes | ⬜ | [02-viewer.md](02-viewer.md) |
| 3 | `/spec-diff` — the written review, and publishing | ⬜ | [03-spec-diff-skill.md](03-spec-diff-skill.md) |
| 4 | Wire it into the loop, and document it | ⬜ | [04-wire-in-and-docs.md](04-wire-in-and-docs.md) |
| 5 | Strip the tab machinery from `/spec-start` | ⬜ | [05-strip-the-tab-machinery.md](05-strip-the-tab-machinery.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-11 | Ready | backlog | Reuben Greaves |
| 2026-09-11 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-11 — Spec created from a working prototype, not from a design
  discussion. The prototype rendered a real linked worktree's **uncommitted**
  diff (9 files, +358/−16, including one untracked file) read entirely from the
  `main` checkout via `git -C`, with whole-file context bands and a file tree.
  Measured costs: ~3,800 output tokens of one-time template work, ~700 per phase
  for the written review, and **zero** for the patch data itself. Reviewing the
  diff cost ~1,675 input tokens only because the prototype reviewed a stranger's
  commit; after `/spec-next` the code is already in context.
- 2026-09-11 — Supersedes three cancelled specs — SKS-82, SKS-121 and SKS-134 —
  all of which assumed a terminal program had to show the diff. Recording it here
  so the fourth attempt is not made from the same premise.
- 2026-09-11 — Added phase 5: with the viewer replacing every reason a shell had
  to move, `open.command` and the `EnterWorktree` branching become dead weight
  and come out. Checked first that removing the key cannot break an existing
  install — the config merge copies known keys only and ignores unknown ones.
- 2026-09-11 — Trimmed to MVP: the two `review.*` config keys became a constant
  and a flag, and phase 5's migration note went. Skitterspec has one user, so
  compatibility work is cost without benefit.
