---
github_identifier: "#191"
github_url: "https://github.com/SkitterByte/skitterspec/issues/191"
---

# /spec-tada: scoped, served, and less chatty

> **Type:** Feature
> **Name:** feat-tada-scope-and-serve
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/191
> **Author:** Reuben Greaves
> **Raised:** 2026-11-12
> **Area:** packages/common/src/env/config.js, packages/common/src/env/project.js, packages/common/src/env/serve.js, packages/common/src/cli.js, packages/common/src/tada/, packages/common/assets/skills/spec-tada/, packages/common/assets/core/env.config.md, docs/reference.html, docs/review.html
> **Stack:** worktree
> **Docs:** reference, review

## Summary

Dog-fooding follow-ups to `/spec-tada` (#182): a recap scoped to the projects
that belong together (work or personal), each shown by its own name; chatter
that led nowhere left out; and the page served live from the review server
with readable dates, instead of a `file://` path.

## Problem

The first real recap mixed work and personal repos in one report, and there is
no way to say which belong together. Prompts typed on branches with no spec
filled the recap without adding much — they matter only when they led to a
spec or a change. The page opened only on the machine that wrote it, and its
header showed raw ISO timestamps. Separately, a project's display name lives
under `review.projectName`, though it names the project everywhere, not just
on review pages.

## Acceptance criteria

- `project.name` and `project.category` can be set in
  `specs/.core/env.config.json`; `project.name` heads every generated page
  (review, epic, ta-da), falling back to the repo folder's name.
- An existing `review.projectName` keeps working.
- Run from a project with a category, the recap includes only projects with
  the same category; uncategorised projects are left out. `--all-projects`
  includes every project.
- Each project in the recap is shown by its `project.name`.
- Branches with no spec show their commits, never their prompts; a session
  that moved onto a spec's branch has its earlier prompts under that spec.
  `--chat` shows everything.
- `--page` prints the review server's local/network/remote links; the page
  is rendered on request, carries the recap, and opens on a phone.
- Page and text headers read as dates (`Thursday 12 November 2026`,
  `Fri 6 – Thu 12 Nov 2026`), not ISO timestamps.

## Decisions

1. **`project` is a skitterspec setting, not a ta-da one.** A top-level
   `project: { name, category }` block in `env.config.json`, committed with
   the repo. `project.name` supersedes `review.projectName`, which is read as
   a fallback so no existing config breaks. Rejected: a per-user file — the
   setting belongs to the project, and the name is already a project fact.
2. **Category is an exact filter.** Run from a project whose category is `X`,
   only projects with category `X` are reported (compared case-insensitively,
   trimmed). Uncategorised projects — and repos without skitterspec, which
   have nowhere to declare one — are not included at all. Run from an
   uncategorised place, everything is included. `--all-projects` includes
   everything regardless.
3. **No-spec groups keep changes, lose chatter.** Their commits stay (a
   release or a dependency bump is work done); their prompts are dropped. A
   session that later stood on a spec's branch led to that spec, so its
   earlier no-spec prompts move into that spec's group. `--chat` restores the
   old behaviour.
4. **Served like a review page: rendered per request, nothing on disk.** A
   `/<token>/tada` route on the review server builds the digest live from the
   window in its query (`?since=…` / `?on=…`). The model's recap is a
   gitignored sidecar beside the review notes (`.spec-env/tada/`), shown with
   when it was written — the same split as review pages, whose notes are
   sidecars and whose HTML is never stored. Rejected: serving a saved HTML
   file, which the server deliberately never reads.
5. **Fallback is unchanged.** No isolation or no server: `--page` writes the
   temp-folder file and prints `file://`, as today.
6. **Dates are written for a person.** One day reads `Thursday 12 November
   2026`; a span reads `Fri 6 – Thu 12 Nov 2026`. The JSON keeps ISO instants
   for scripts.
7. **The page header carries the running project's name**, like every other
   generated page, with its category beside it when one is set.

## Solution overview

`env.config.json` gains `project: { name, category }`; `projectName(config)`
reads `project.name`, then `review.projectName`, then the folder. The digest
reads each repo's config for its name and category, filters by the running
project's category unless `--all-projects`, and drops no-spec prompts unless
`--chat`. `--page` saves the recap under `.spec-env/tada/<label>.md` and
prints the served URL for the window; the server's `tada` route rebuilds the
digest per request and renders it with the saved recap.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `project.name`, `project.category` (env.config.json) |
| Config key | update | `review.projectName` → read as fallback for `project.name` |
| CLI command | update | `skitterspec tada --all-projects`, `--chat`; `--page` prints served links |
| Route/UI | add | review server `/<token>/tada?since=… / ?on=…` |
| Skill/rule | update | `/spec-tada` — scope, chatter, page links |
| Docs | update | reference.html, review.html, env.config.md |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Project name and category, and scoping by them | ✅ | [01-project-settings.md](01-project-settings.md) |
| 2 | Changes over chatter | ⬜ | [02-changes-over-chatter.md](02-changes-over-chatter.md) |
| 3 | Readable dates and a served page | ⬜ | [03-served-page.md](03-served-page.md) |

## Open questions

- [ ] None

## Changelog

- 2026-11-12 — Spec created, from dog-fooding `/spec-tada` (#182).
- 2026-11-12 — Phase 1: `config.project` was already taken at runtime — the
  non-enumerable checkout anchor `attachProject` sets — so the anchor is now
  `config.checkout`, freeing `project` for the config block. Also commits the
  `.claude/skills/spec-tada` link #182 left untracked; main's
  `claude-links` test fails without it.
