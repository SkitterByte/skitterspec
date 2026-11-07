---
linear_identifier: "SKS-172"
linear_url: "https://linear.app/skitterbyte/issue/SKS-172/what-is-in-flight-a-status-view-that-reads-the-worktrees"
github_identifier: "#20"
github_url: "https://github.com/SkitterByte/skitterspec/issues/20"
---

# What is in flight — a status view that reads the worktrees

> **Type:** Feature
> **Name:** feat-in-flight-status (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-12
> **Area:** packages/common/src/cli.js, packages/common/src/env/registry.js, packages/common/src/env/resolve.js, packages/common/src/env/handoff.js, packages/common/README.md, packages/common/assets/rules/spec-planning.md, packages/common/assets/claude-md-section.md, docs/reference.html, packages/common/test
> **Stack:** worktree
> **Docs:** reference

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

1. **Read each worktree's code facts.** For every provisioned spec, read its
   folder **in the worktree**, where the bucket is truthful, and report the
   bucket, the phase progress and the current phase. Progress is counted from
   the phase files' H1 emoji, which `/spec-review` names as authoritative, by
   the same `phaseProgress` that `spec-env handoff` already uses. A
   `> **Status:**` or `> **Developer:**` header is shown only where the spec
   still carries one: a spec written before `feat-tracker-owns-status`, or a
   repo with no provider. Under `pull` those headers are never written, because
   the board owns status and the assignee. This command does not go and fetch
   them. It costs a few file reads and no network. Rejected: leaving the output
   as paths and fixing it in prose (you would read it and go looking anyway);
   merging in the tracker's view (a network call on a command that is instant
   and offline today, and only possible where a provider is installed;
   `spec-sync list` and `spec-sync board` are that view). *Revised 2026-11-07:
   it read the `Status:` and `Developer:` headers, which `pull` no longer
   writes.*
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
6. **A `/no-spec` worktree is listed as `(no spec)`, not `unknown`.** It has a
   branch and no document by design (`spec-env nospec`), and `spec-env status`
   already prints it that way. Calling it unknown would accuse a healthy record.
7. **Across machines is not this command's question.** A teammate's spec that
   is not on this disk is answered by the provider listing today, and by the
   in-flight index in `feat-tracker-owns-status` phase 6 (D3) if that service
   is built. This command stays offline and local.

## Solution overview

```
$ skitterspec status

2 specs in flight
  feat-no-branch-autopush         in-progress · 1 of 3 phases done, phase 2 in progress
    ../skitterspec-wt/no-branch-autopush
  bug-health-probe-timeout        in-progress · 0 of 1 phases done · In Progress · Reuben Greaves
    ../skitterspec-wt/health-probe-timeout
  docs-catch-up                   (no spec)
    ../skitterspec-wt/docs-catch-up

On this branch they read `backlog` — a spec's bucket moves on its own branch.
```

The second row is a spec that still carries `Status:` and `Developer:` headers,
so they are shown as well. The first was written under `pull` and has neither.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec status` (`--json`) |
| CLI output | update | `spec-env status` gains bucket and phase progress, plus any status/developer header the spec carries |
| Engine | add | a reader for a spec folder: bucket, phase progress, optional legacy headers |
| Engine | update | `phaseProgress` moves out of `env/handoff.js` into a shared module both use |
| Docs | update | README, `spec-planning.md`, `docs/reference.html`, the adopters' CLAUDE.md section |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Read a spec's real state from its worktree | ✅ | [01-spec-reader.md](01-spec-reader.md) |
| 2 | `skitterspec status` | ✅ | [02-status-command.md](02-status-command.md) |
| 3 | Point people at it | ⬜ | [03-docs.md](03-docs.md) |

## Non-goals

- **Changing where a spec's status lives.** Decision 4.
- **Reading the tracker.** This stays offline and instant; the provider's own
  listing already answers "what has a teammate started that is not on my disk",
  and `spec-sync board` answers "has the board finished it" (Decision 7).
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
- 2026-11-07 — Reviewed vs codebase after `feat-tracker-owns-status` landed.
  Under `pull`, new specs carry no `Status:` or `Developer:` header, so
  Decision 1 now reads code facts: the worktree bucket, and phase progress
  from phase-file H1s via `phaseProgress` (added by that spec's phase 5). It
  still shows a legacy header where there is one. Added Decision 6
  (`/no-spec` worktrees, which `spec-env status` now lists) and Decision 7
  (cross-machine belongs to the provider listing and the phase 6 service). Added
  the missing `Docs:` header. `spec-env status` also prints waiting reviews now.
  No task was already done; `skitterspec status` does not exist yet.
- 2026-11-07 — Phase 1: the reader is `env/specstate.js` (`readSpecState`), and
  `phaseProgress` moved to `env/phases.js`. A spec found in two buckets
  mid-`git mv` reports the destination. Follow-up surfaced: `readPhases` in
  `resolve.js` lets a phase's `Status:` line win over its H1 emoji, while
  `phaseProgress` reads only the emoji. The two rules can disagree on a
  hand-edited phase. Also surfaced: `review-gate.cjs` reads an engine crash
  (exit 1, no output) as "a verdict is owed", so a broken engine locks the
  session out of Bash, including `!` commands.
- 2026-11-07 — Phase 2: `env/inflight.js` collects and formats the rows, and
  `provisionedSpecs` is shared by both commands. Two refinements over the plan.
  The heading counts only specs whose worktree copy is not complete or
  cancelled, because a declined teardown leaves a finished spec's worktree
  standing; such rows are still listed. The closing line is a positive
  signal, printed only for specs whose bucket here differs from the one in
  their worktree (or that are absent here), so an idle repo, or one whose
  worktrees agree, says nothing.
