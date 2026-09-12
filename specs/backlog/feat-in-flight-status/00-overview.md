---
linear_identifier: "SKS-172"
linear_url: "https://linear.app/skitterbyte/issue/SKS-172/what-is-in-flight-a-status-view-that-reads-the-worktrees"
---

# What is in flight — a status view that reads the worktrees

> **Type:** Feature
> **Name:** feat-in-flight-status (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-12
> **Area:** packages/common/src/cli.js, packages/common/src/env/registry.js, packages/common/src/env/resolve.js, packages/common/README.md, packages/common/assets/rules/spec-planning.md, docs/index.html, packages/common/test
> **Stack:** worktree

## Problem

Standing on the base branch, `specs/in-progress/` is empty while two specs are
being built — and worse, each of those specs still reads
`Status: Ready — not started` in `specs/backlog/`. That is not a bug: a spec's
status moves **on its own branch**, which is precisely what lets several run at
once. But it means the base branch — the one place everyone looks — actively
describes in-flight work as un-started.

The truth is already on disk, in each worktree's copy of the spec. Nothing
surfaces it: `spec-env status` lists worktree **paths** and stops, so it answers
"what is provisioned" and not "what is being worked on, and how far along". And
it lives two words deep inside the isolation engine, which is not where anyone
looks for "what is going on in this repo".

## Decisions

1. **Read each worktree's own spec file.** For every provisioned spec, open its
   `00-overview.md` **in the worktree** — where the header is truthful — and
   report the real Status, the phase progress and the Developer. It costs a few
   file reads and no network. Rejected: leaving the output as paths and fixing it
   in prose (you would read it and go looking anyway); merging in the tracker's
   view (a network call on a command that is instant and offline today, and only
   possible where a provider is installed).
2. **A top-level `skitterspec status`.** "What is going on here" is a
   first-class question and should not be filed under the isolation engine.
   `spec-env status` stays, unchanged in name and enriched in output, so nothing
   that already works breaks.
3. **Say why the buckets disagree, in the output.** The one line that had to be
   explained by hand — a spec's status lives on its own branch, so the base branch
   reads `backlog` for in-flight work — belongs where the confusion happens, not
   only in a rule file someone may never open.
4. **The base branch is not changed to compensate.** Making `/spec-start` commit
   the bucket move to the base would mutate it on every start, leave cancelled
   specs needing cleanup there, and re-introduce the conflicts the per-branch model
   exists to avoid. The reporting is what was missing; the model is right.
5. **A worktree whose spec cannot be read is reported, never guessed.** No file,
   no header, unparseable — it says `status unknown` against that spec and still
   lists it. A provisioned spec dropping out of the listing because its header was
   malformed would hide exactly the thing the command exists to show.

## Solution overview

```
$ skitterspec status

2 specs in flight
  feat-no-branch-autopush         In Progress · phase 2/3 · Reuben Greaves
    ../skitterspec-wt/no-branch-autopush
  feat-selfhost-link-integrity    In Progress · phase 1/2 · Reuben Greaves
    ../skitterspec-wt/selfhost-link-integrity

On this branch both read `backlog` — a spec's status lives on its own branch.
```

Phase progress is counted from the `00-overview.md` phase index (`✅` against the
total), which is the same table the lifecycle skills already keep in step.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec status` (`--json`) |
| CLI output | update | `spec-env status` gains status, phase progress, developer |
| Engine | add | a reader for a spec folder's header + phase counts |
| Docs | update | README, `spec-planning.md`, the docs site |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Read a spec's real state from its worktree | ⬜ | [01-spec-reader.md](01-spec-reader.md) |
| 2 | `skitterspec status` | ⬜ | [02-status-command.md](02-status-command.md) |
| 3 | Point people at it | ⬜ | [03-docs.md](03-docs.md) |

## Non-goals

- **Changing where a spec's status lives.** Decision 4.
- **Reading the tracker.** This stays offline and instant; the provider's own
  listing already answers "what has a teammate started that is not on my disk".
- **Gating anything on it.** It reports; nothing refuses on what it finds.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-12 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-12 — Spec created after the base branch described two in-flight specs
  as `Ready — not started`. Paired with a Bug spec for the refusal this same gap
  produces in `spec-env up`; they are separate because one is test-first red→green
  and the other is a reporting change.
