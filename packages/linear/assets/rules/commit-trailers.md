# Commit Trailers

Extends `commit-messages.md` — the format, length limits and `Release-Note:`
grammar there all still apply. This file adds one trailer, and it is only
installed when a ticketing provider is.

## `Refs:` — the ticket this commit belongs to

A commit made on a spec's branch carries the Linear issue it belongs to, as the
**last** trailer in the message:

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

## Rules

- **Omit the trailer entirely when there is no ref.** `spec-sync ref` exits
  non-zero and prints nothing on a commit that has no ticket — on `main`, or on
  a spec kept deliberately local. Never invent one, and never write
  `Refs: none`: the release report counts unreferenced commits, and a fabricated
  ref is worse than an honest gap.
- **One ref per commit.** A commit belongs to one spec — the spec whose branch
  it is on. If work genuinely spans two tickets, that is two commits.
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
`spec-sync released <range>` report the tickets a release contains.
