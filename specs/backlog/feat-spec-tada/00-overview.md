---
github_identifier: "#182"
github_url: "https://github.com/SkitterByte/skitterspec/issues/182"
---

# /spec-tada — a ta-da list of what got done

> **Type:** Feature
> **Name:** feat-spec-tada
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/182
> **Author:** Reuben Greaves
> **Raised:** 2026-11-11
> **Area:** packages/common/src/tada/ (new), packages/common/src/cli.js, packages/common/assets/skills/spec-tada/ (new), packages/common/assets/claude-md-section.md, packages/common/assets/rules/spec-planning.md, docs/reference.html, README.md
> **Stack:** worktree
> **Docs:** reference

## Summary

A `/spec-tada` skill — a ta-da list rather than a to-do list — that recaps
what you did in Claude Code over a window (today by default), across every
project on the machine, grouped by project and then by spec: what landed,
what was explored but not committed, and what is still open, ending in a
three-line standup.

## Problem

At the end of a day spread across several repos, worktrees and specs there is
no single place that says what got done. Transcripts sit under
`~/.claude/projects/`, commits sit in each repo, and spec progress sits on
each spec's branch. A draft `today` skill (inline Python over the transcripts,
then `git log` per cwd) proves the idea but splits one repo into one
"project" per worktree — a session `cd`s into `../<repo>-wt/<slug>` and its
`cwd` follows — and knows nothing about specs, which is the unit this
workflow actually reports in.

## Acceptance criteria

- `/spec-tada` (or "what did I do today?") produces a recap grouped by
  project, then by spec, with Done / Explored / Open per group, and a
  3-line standup at the end.
- Work done in a spec's worktree is reported under that spec in its repo,
  never as a separate project.
- `--since yesterday` (or a date / weekday) widens the window; `--here`
  narrows it to the current repo.
- A spec line carries its ticket id where a provider linked one, with no
  tracker call made.
- A project with no skitterspec still appears, grouped by branch.
- The model reads a compact digest, never a raw transcript.
- An optional HTML page of the recap can be rendered on request.

## Decisions

1. **An engine verb does the reading; the skill writes the recap.**
   `skitterspec tada [--since <when>] [--here] [--json]` scans transcripts and
   git deterministically and prints a capped digest; the skill relays it and
   writes the prose. Rejected: the draft's inline Python — untestable, a
   Python dependency, and spec mapping in a heredoc.
2. **All projects by default; `--here` narrows.** The value is the
   cross-project day. Projects without skitterspec are grouped by branch.
3. **The project is the repo, not the cwd.** A cwd resolves to its repo via
   `git rev-parse --git-common-dir`, so every worktree folds into its primary
   checkout. A cwd that no longer exists (a torn-down worktree) falls back to
   the session's first resolvable cwd, keeping its `gitBranch` — cannot-tell
   is reported, never dropped.
4. **Window is local time.** Default local midnight → now; `--since`
   takes `yesterday`, a weekday name (most recent past), or `YYYY-MM-DD`.
   Transcript timestamps are UTC and are compared as instants, not by string
   prefix (the draft's `startswith(today)` is wrong across midnight UTC).
5. **A spec is attributed by branch, plus lifecycle moves.** A branch is
   mapped to a spec through that project's `branch.pattern`. Commits in the
   window that move `specs/<bucket>/<name>` or flip a phase heading to ✅
   are reported as events: spec written · started · phase N done ·
   completed · cancelled. Base-branch work with no spec falls under
   `no spec`.
6. **Commits are the author's, across all refs, deduped by sha.** Author is
   matched on each repo's own `user.email` (falling back to `user.name`).
   A commit on the base branch is attributed by its `Refs:` trailer or the
   spec folder it touches before falling to `no spec`.
7. **Prompts are filtered and capped.** Dropped: `isMeta`, sidechains, tool
   results, command caveats, system reminders. Slash commands are kept as
   events (`/spec-next`). Each prompt is cut to 200 chars and each session
   to its first and last few prompts, so the digest stays small however
   long the day was.
8. **Tickets come from local data only.** The spec's identifier
   frontmatter (`*_identifier` / `*_url`) or a commit's `Refs:` trailer.
   No tracker is asked.
9. **Open = what is in flight now**, reused from `skitterspec status`'s
   reader: specs with worktrees, phase progress, a waiting review pass or an
   armed gate. Not "everything in the backlog".
10. **Output is a chat recap; the page is optional.** The recap is the
    body of the run, followed by the standard report block. On request,
    `skitterspec tada --page --summary <file>` renders the digest plus the
    model's recap as a self-contained HTML file in the OS temp dir — not
    served, so it carries no verdict and the run never waits on it.
11. **Model-invocable.** "What did I do today" / "standup" should reach it.
    It reads transcripts the user already owns into the local session only;
    nothing is sent anywhere, and publishing the page is a separate,
    explicit act.

## Solution overview

`tada` = transcripts → sessions (repo, branch, prompts, time span) ⨝ git →
commits & lifecycle events per (repo, spec|branch) ⨝ in-flight state →
digest. Digest shape (JSON; text form mirrors it):

```
{ window: {since, until},
  projects: [{ repo, name, skitterspec: bool,
    groups: [{ spec|branch, ticket?, sessions, prompts[],
               commits[{sha, subject}], events[], open? }] }],
  notes: ["cannot tell: <cwd> no longer exists", …] }
```

The skill turns that into Done (commits/events) · Explored (sessions with
no commit) · Open per group, then a 3-line standup (yesterday-style done ·
next · blockers).

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec tada [--since] [--here] [--json] [--page --summary <file>]` |
| Skill/rule | add | `/spec-tada` skill (model-invocable) |
| Skill/rule | update | spec-planning.md skill table, claude-md-section.md |
| Docs | update | docs/reference.html — `tada` verb |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Transcript digest by repo and branch | ⬜ | [01-transcript-digest.md](01-transcript-digest.md) |
| 2 | Git, spec attribution and open items | ⬜ | [02-git-and-specs.md](02-git-and-specs.md) |
| 3 | `/spec-tada` skill, text output, docs | ⬜ | [03-skill-and-docs.md](03-skill-and-docs.md) |
| 4 | Optional HTML page | ⬜ | [04-html-page.md](04-html-page.md) |

## Open questions

- [ ] None

## Changelog

- 2026-11-11 — Spec created, seeded from a draft `today` skill.
