---
name: spec-park
description: Park a spec in flight on something outside the repo — a deploy, another project's release, a soak period — by recording a `Blocked on:` line on the spec or one of its phases, committed on its branch. The worktree stays. `/spec-resume` is how you come back. Use when the user says "/spec-park", "park this until…", "we're waiting on the deploy", "this is blocked on <thing>", or a phase cannot go on until something happens elsewhere.
---

# /spec-park — record why a spec is waiting

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

A spec that stops for a reason outside the repo looks, from the outside, just
like one somebody abandoned. This skill writes the reason down where every
other skill reads it: `/spec-resume` shows it first, `/spec-next` stops before
building past it, and `/spec-todo` and the ticket both say *parked* rather than
*stalled*.

The argument is `"<reason>" [--until YYYY-MM-DD] [--phase N] [<spec>]`.

## 1. Find the spec

Ask the engine, with the spec named or, bare, the one you are standing in:

```
skitterspec spec-env resume [<spec>] --json
```

**Only an in-progress spec is parked.** On `ok: false`, relay `refused` and stop
with `⏸`. A backlog spec has not started, so there is nothing to wait in the
middle of. A spec with no worktree here is still parked, on its branch, after
`/spec-resume` has put it back on this machine. Say that in `Next` rather
than writing into a tree that is not there.

**A reason is required.** A bare `/spec-park` asks for one and writes nothing.
"Blocked" with no reason is the silence this exists to replace. The reason is
what the person coming back acts on.

## 2. Write the line

```
> **Blocked on:** <reason> (until <YYYY-MM-DD>)
```

The `(until …)` is optional, and is the only part anything reads as data: past
that date `/spec-todo` says the wait has run out. Write a date only when one
was given. Never infer one from "a week".

- **No `--phase`:** the line goes in `00-overview.md`'s header block, after
  the last `> **…:**` line. It holds every phase.
- **`--phase N`:** it goes in `0N-<slug>.md`'s header, under the
  `> Spec: …` line. It holds that phase only. Earlier phases still build.

**A line already there is replaced, not doubled.** Say in `Notes` what it
said before. That is history worth keeping, so it also gets a dated Changelog
line: `- <date> — Parked: <reason>` (or `Re-parked: …, was <old>`).

## 3. Commit it on the spec's branch

Inside the spec's worktree. Use `skitterspec spec-env stage <spec>` for the
`owned` paths, and commit pathspec-bounded on both halves as
`docs(spec): park <spec> — <reason, short>`, with the `Refs:` trailer
(`spec-sync ref`) when there is a ticket.

**Only the spec's own documents.** Uncommitted work belonging to the phase in
progress is left exactly as it is, and reported in `Untouched`. Parking is not
a reason to commit half a phase.

**The worktree stays.** A wait is usually days, and `/spec-resume` rebuilds a
worktree only when one is actually missing.

**The ticket hears about it on the next push.** Where a provider is installed,
run `/spec-push` now: the summary block carries the blocker. It is never
fatal, and the board's Status is never set from here, because the tracker owns
status.

## Report

End with the block defined in `.claude/rules/spec-reports.md`.

**Verdicts**

- `✅`: the line is written and committed.
- `⏸`: refused (not in progress, no reason, no worktree here). Nothing
  changed.

**Fields:** `Tracker` · `Spec` · `Built` · `Notes` · `Untouched` ·
`Follow-ups` · `Next`

`Built` quotes the line as written and where it went (spec, or phase N). `Next`
is `/spec-resume <spec> <what happened>` for whoever comes back, written the way
they would type it.
