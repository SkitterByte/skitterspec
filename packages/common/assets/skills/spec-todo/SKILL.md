---
name: spec-todo
description: The morning half of the ta-da list — where each project was left on the last day you worked (Monday reads Friday), what is still open, what is waiting on you, and what to pick up first, ending in a three-line standup. Read-only. Use when the user says "/spec-todo", "where did I leave off", "what's on today", "what was I doing", "morning summary", or starts a day asking what is next.
---

# /spec-todo — where you left off, and what is ahead

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Read-only. It writes nothing, commits nothing and publishes nothing. `/spec-tada`
answers the evening question — *did I get anything done?* — and this answers the
morning one: *where was I, and what now?*

## 1. Get the to-do

```
skitterspec todo [--here | --all-projects]
```

- **`--here`** — "this repo", "this project": only the repo the session is
  standing in.
- **`--all-projects`** — "everything", "work and personal": every project on the
  machine.

There is no window to choose. The engine finds the **last day with any activity**
before today — up to 14 days back, so a Monday reads Friday and a day off is
skipped — and reads that day, plus today so far. It is scoped by
`project.category` exactly as `/spec-tada` is, and names the category on its
first line when there is one.

**Read the text form, never `--json`**, and **never read a transcript yourself** —
the same two rules, for the same reasons, as `/spec-tada`. The output quotes the
person's own prompts; it stays in this conversation and is never published.

What the lines mean:

- `(here)` — the project this session was started in. It is listed first, and
  it is listed even on a morning nothing happened there, with its open specs.
- `left:` — the last move or commit on that spec, the day it was left.
- `- …` — the last thing typed on it: what was on the person's mind when they
  stopped.
- `in flight:` — where the spec stands now, and its next action.
- `finished:` — the specs that day completed or cancelled, by name.
- `blocked:` — a review verdict waiting, or a gate armed by a phase that ended
  and still owes an answer. Read only for specs in flight.
- `ideas:` — how many ideas are waiting for the `(here)` project. It is a count,
  never the next action: `/spec-idea` lists them, and the line is absent when
  there are none or the count could not be read.
- `today:` — commits and moves since midnight, when there are any.

## 2. Write the recap

One short section per project, `(here)` first. For each open spec, one line:
where it was left and what is next, in plain words. Then `finished:` as one line
and `blocked:` lines as they are — a blocker is the thing most worth seeing in
the morning.

**Only the `(here)` project's next actions are commands.** Every other project's
are suggestions in its own section — *"ereqs has chore-perf-alerts ready to
complete"* — never a bare `/spec-…`. This session acts on the project it was
started in; the others are picked up in a session of their own.

Then the **standup** — three lines, no more:

- **Left off:** where yesterday (or the last working day) ended, across every
  project — a line, not a list.
- **Today:** the `(here)` project's first one or two actions — or
  `nothing in flight here`.
- **Blockers:** the `(here)` project's `blocked:` lines — or `none`. Only what
  the output shows; never invent one.

A fortnight with nothing in it is still an answer: say so, and name what is in
flight in the home project if anything is.

## 3. The page — only when asked

Exactly as `/spec-tada` §3, with `skitterspec todo <the same flags> --page
--summary <that file>`. It is served beside the ta-da page where the project has
a review server, and is a `file://` page where it does not. Never publish it.

## Report

The recap and standup are the body of the message; the block follows them and
is the last thing in it.

**Verdicts**

- `✅` — the to-do is written. Nothing in 14 days is still `✅`, said as such.
- `⚠️` — written, but the output said `cannot tell` somewhere. Name it in
  `Notes`.

**Fields:** `Built` · `Notes` · `Follow-ups` · `Next`

`Built` is the day it read as "left off" and the counts — projects, open specs,
blockers — and the page's tiers (or its `file://` path) when one was rendered.
`Notes` carries the output's own closing lines and, when no page was asked for,
that `--page` renders one. `Next` is the `(here)` project's first action, or
`nothing in flight here` — never another project's.

**`Follow-ups` is always `none` here.** This skill reports work; anything it
notices belongs to the spec it is about.
