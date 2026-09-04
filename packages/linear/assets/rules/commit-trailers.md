# Commit Trailers

Extends `commit-messages.md` — the format, length limits and `Release-Note:`
grammar there all still apply. This file adds one trailer, and it is only
installed when a ticketing provider is.

## `Refs:` — the ticket this commit belongs to

A commit carries the Linear issue **its own changes** belong to, as the **last**
trailer in the message:

```
fix(sync): verify no longer flags every update

- Key the apply read-back by ref, resolving id via the projection

Release-Note: Pushing a spec whose phases already exist in Linear no
longer reports every one of them as a possible stale reference.

Refs: SKS-29
```

Get the value from the engine rather than reading it off a spec by hand:

```
pnpm exec skitterspec-linear spec-sync ref
```

Bare, that answers **from the branch** — correct whenever you are committing
that branch's own implementation work, which is nearly always.

## When the branch and the commit disagree

The branch is a proxy for "what this commit is about", and it is a good one
right up until you commit something that is not this branch's work. The usual
way in: part-way through a spec, a design question warrants its own spec, so
`/spec` writes a new one into `specs/backlog/` and links it. That commit is
**entirely the new spec's**, but you are standing on the old spec's branch, and
the bare command answers with the old spec's ticket.

Name the spec instead — still the engine, never a hand-written id:

```
pnpm exec skitterspec-linear spec-sync ref feat-distance-prescriptions
```

The branch is not consulted, so this works from `main` too. An unknown spec name
fails rather than falling back to the branch, so a typo can't become a
confidently wrong ref.

**Better still, avoid the split:** author backlog specs from the base branch.
A spec written inside another spec's worktree physically lives on that branch —
it is not on `main` until that spec lands, and it is cancelled along with it.

## Rules

- **The ref names the commit's subject, not your location.** If they disagree,
  the commit's subject wins — resolve it with `spec-sync ref <spec>`.
- **Omit the trailer entirely when there is no ref.** `spec-sync ref` exits
  non-zero and prints nothing on a commit that has no ticket — on `main`, or on
  a spec kept deliberately local. Never invent one, and never write
  `Refs: none`: the release report counts unreferenced commits, and a fabricated
  ref is worse than an honest gap.
- **One ref per commit.** A commit belongs to one spec. If work genuinely spans
  two tickets, that is two commits — and that is the fix when a single commit
  would mix a branch's own work with another spec's files.
- **Never use Linear's magic words** — `Fixes`, `Closes`, `Resolves`. Those
  close the issue the moment the commit reaches the default branch, which is
  wrong here: a ticket moves when its work is **released**, not when it merges.
  `Refs:` is deliberately inert to Linear's automation.
- **Blank line before it**, like `Release-Note:` — it is a git trailer, not body
  text.
- Put it **after** `Release-Note:` when both are present, so the human-facing
  note reads first.

## Why it exists

The repo lands specs with `merge --ff-only`, so history is linear and branch
names never reach it. The commit message is the only artefact that survives into
the range a release scans, which is what lets
`spec-sync released <range>` report the tickets a release contains. A ref that
names the wrong ticket does not merely lose information — it moves a commit onto
another ticket's release report, which is worse than the gap it was meant to
close.
