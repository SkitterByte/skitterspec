---
linear_identifier: "SKS-38"
linear_url: "https://linear.app/skitterbyte/issue/SKS-38/ticket-refs-in-commits-and-a-releases-ticket-list"
---

# Ticket refs in commits, and a release's ticket list

> **Type:** Feature
> **Name:** feat-commit-ticket-refs (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/linear/assets/rules, packages/linear/src/cli-sync.js, packages/linear/src/released.js, packages/linear/test
> **Stack:** worktree

## Problem

Nothing connects a commit to the Linear issue it belongs to, so a release cannot
say which tickets it contains. Cutting `skitterspec-linear@10.4.0` meant reading
14 commit subjects and recognising the work by eye.

The obvious routes are both closed. **Branch names carry nothing into history**:
`/spec-complete` lands with `merge --ff-only` and this repo has **zero merge commits**,
so `branch.pattern`'s existing `{identifier}` token never reaches a commit. And
the commit skill is **not ours to compose** — `/commit` and `commit-messages.md`
ship from `@skitterbyte/skittership` and carry no seam markers, unlike `/spec`
or `/spec-complete`.

## Decisions

1. **The ref lives in a commit trailer**, not a branch name or a PR title. With a
   fast-forward-only history the commit message is the only artefact that
   survives into the range a release scans.
2. **`Refs: <KEY-N>`, deliberately not Linear's magic words.** `Fixes SKS-30`
   would auto-close the issue when the commit reaches the default branch, which
   is precisely wrong: the ticket should move when the work is *released*, not
   when it merges. `Refs:` is inert to Linear's automation and greppable by us.
3. **The linear package ships `.claude/rules/commit-trailers.md`.** Rules are
   already discovered dynamically (`listRules`, `packages/common/src/init.js:26`)
   and provider assets are overlaid wholesale by `build-dist.js`, so the file
   reaches `.claude/rules/` with **no installer change** — and the tracker-free
   base distribution never ships it. Rejected a git hook: it appends the trailer
   after the fact rather than the commit being written correctly, and it is
   invasive infrastructure this repo has none of.
4. **A `spec-sync ref` helper resolves the ticket**, so neither a person nor a
   model has to go spelunking for it. It maps the current branch back to its spec
   and prints `linear_identifier`. Deterministic, and usable from a hand-typed
   commit.
5. **`spec-sync released <range>` is read-only.** It reports the tickets in a
   commit range; it does not move them. A release can be cut and never deployed,
   and today workflow state is pushed from a spec's *folder bucket* — "released"
   is not a lifecycle bucket, so moving tickets here would be a new kind of write
   with no dry run. Rejected `--move <state>` for now; the report is the piece
   that unblocks the workflow.
6. **Titles are an enrichment, never a requirement.** The scan is offline — refs
   come from `git log`. Issue titles are fetched only when the API transport is
   available, and their absence degrades to bare refs rather than failing.
7. **A skittership clause is a follow-on, not a dependency.** `.claude/rules/*.md`
   are loaded as project instructions directly (this repo has no `CLAUDE.md` at
   all), so the rule takes effect on its own. Pointing
   skittership's `commit-messages.md` at `.claude/rules/commit-trailers.md` makes
   the extension point discoverable to a human reader, and belongs in that repo.

## Solution overview

A commit made on a spec's branch carries the ticket it belongs to:

```
fix(sync): verify no longer flags every update

- Key the apply read-back by ref, resolving id via the projection

Refs: SKS-29
```

The rule tells whoever writes the commit to add that trailer, and how to get it:

```
$ pnpm exec skitterspec-linear spec-sync ref
SKS-29
```

`ref` resolves the current branch back to its spec (the inverse of the
`branch.pattern` expansion `resolve.js` already does) and prints its
`linear_identifier`. Off a spec branch, or on a spec that is not linked, it says
so and exits non-zero — there is simply no ref, and the commit omits the trailer.

At release time:

```
$ spec-sync released skitterspec-linear@10.4.0..HEAD

  SKS-29  Bug: verify reports every updated sub-issue as a stale ref
  SKS-30  /spec-sync skill and identifier-drift doctor

  2 ticket(s) in 14 commit(s)
  3 commit(s) carry no ref (chore/docs)
```

The unreferenced count is deliberate: silence about them would read as "every
commit is accounted for", when in fact housekeeping commits legitimately carry no
ticket and a *missed* trailer looks identical.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | add | `.claude/rules/commit-trailers.md` (Linear distribution only) |
| CLI command | add | `spec-sync ref` |
| CLI command | add | `spec-sync released <range> [--json]` |
| Module | add | `packages/linear/src/released.js` — range scan + dedupe |

No change to the projection, the snapshot format, or any push/apply path. The
trailer is additive: existing commits without it are reported as unreferenced,
never as an error.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `spec-sync ref` and the trailer rule | ⬜ | [01-ref-and-rule.md](01-ref-and-rule.md) |
| 2 | `spec-sync released` — a release's ticket list | ⬜ | [02-released-report.md](02-released-report.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | Ready | backlog | Reuben Greaves |
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-02 — Spec created.
