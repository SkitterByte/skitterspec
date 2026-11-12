---
name: spec-tada
description: A ta-da list rather than a to-do list — recap what you did in Claude Code over a day (or since a date), across every project on this machine, grouped by project and then by spec — what landed, what was explored but not committed, what is still in flight — ending in a three-line standup. Use when the user says "/spec-tada", "what did I do today", "daily recap", "standup summary", "what have I done since Friday", or asks for an end-of-day summary.
---

# /spec-tada — a ta-da list of what got done

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Read-only. It writes nothing, commits nothing and publishes nothing — it reads
what already happened and says it back in the shape a standup wants.

## 1. Get the digest

```
skitterspec tada [--since <when> | --on <when>] [--here | --all-projects] [--chat]
```

Map the request onto the flags and nothing else:

- **`--since <when>`** — from that day to now: "since Friday", "this week",
  "the last three days".
- **`--on <when>`** — that one day: "what did I do last Friday", "on the 6th".
  Neither flag is today.
- **`--here`** — "this repo", "this project": narrow to the repo the session is
  standing in.
- **`--all-projects`** — "everything", "work and personal": every project on
  the machine.
- **`--chat`** — "everything I talked about", "include the chats": keep the
  prompts on branches with no spec too.

**The report is scoped by category without being asked.** Run from a project
whose `project.category` is set (in `specs/.core/env.config.json`), it covers
only the projects with the same category; uncategorised ones are left out. The
first line of the digest names the category when there is one — say it in
`Built`, so the reader knows what the report covers. Each project is shown by
its `project.name`.

A `<when>` is any of these, passed as the words the person used — no quoting:

| Kind | Examples |
|------|----------|
| named | `today` · `yesterday` · `friday` · `last friday` · `last week` |
| relative | `3 days ago` · `3d` · `2 weeks ago` · `2w` |
| a date | `2026-11-06` · `6 Nov` · `Nov 6` · `6 November 2026` |

A weekday is the most recent past one, so never more than a week back. A date
with no year is the most recent such date. `11/12` is refused rather than
guessed — it is a different day in London and New York — so translate a
numeric date only when the person's meaning is unambiguous, and write it as
`YYYY-MM-DD`.

**Read the text form, never `--json`.** It carries the same facts at a fifth of
the size, and the size is the whole cost of this skill.

**Never read a transcript yourself.** The engine reads them down to the prompts
a person typed — capped, and only the first and last few per session — and folds
each session into its repo, so a worktree is never mistaken for a project. A
transcript opened by hand is the thing the digest exists to avoid paying for.

A window the engine cannot read is refused with exit 1 and a line naming the
fix — relay it and stop with `⏸`. Everything else exits 0, a quiet day included.

**The digest quotes the person's own prompts.** It stays in this conversation:
do not paste it anywhere else, and never publish it.

## 2. Write the recap

One section per project, then one entry per group. A group headed by a spec
(`feat-orders [#12]`) is that spec's work wherever it happened — its branch, its
worktree, or a commit on the base naming it. A group headed `<branch> — no spec`
is work that names none, and carries only its commits: prompts typed where no
spec was in play are left out, unless the session went on to a spec — then
they sit under that spec, as the conversation that led to it.

For each group, say what applies and skip what does not:

- **Done** — the lifecycle moves (`* written`, `* started`, `* phase N done`,
  `* completed`) and the commits (`+ <sha> <subject>`). Say what changed in a
  line, from the subjects — do not list every sha.
- **Explored** — a spec's sessions beyond what its commits say: what was
  looked into, asked or decided, read off the prompts. The prompts are partial by
  construction (`… N more` marks the cut), so say what they show, not that it
  is everything.
- **In flight** — the `in flight:` line: where the spec stands and its next
  action, as the engine wrote it.

Name a spec by its folder and its ticket exactly as the digest gives them. Keep
each entry to a line or two; a project with only in-flight rows gets one line
listing them.

Then the **standup** — three lines, no more:

- **Done:** the work that landed or moved, across every project.
- **Next:** the in-flight next actions that matter most.
- **Blockers:** a verdict waiting, a gate armed, a wait unmet — or `none`.
  Only what the digest shows; never invent one.

## 3. The page — only when asked

When the person asks for the recap as a page — "as a page", "something I can
share", "`--page`" — write the recap and standup you just wrote, as markdown,
to a temporary file, and run the same window again with it:

```
skitterspec tada <the same flags> --page --summary <that file>
```

It prints one line, `page: file://…` — a self-contained page with the recap on
top and the digest underneath, in the system temp folder. Put that path in
`Built`. It is a file on this machine: it is never served, and
**never publish it** — it quotes the person's prompts, so sharing it is
theirs to do.

Not asked, it is not rendered — say once, at the end of `Notes`, that
`--page` would.

## Report

The recap and standup are the body of the message; the block follows them and
is the last thing in it. That file carries the shape; this section carries only
what is specific here.

**Verdicts**

- `✅` — the recap is written. A window with nothing in it is still `✅`, said
  as such: a quiet day is an answer.
- `⚠️` — written, but the digest said `cannot tell` somewhere. Name it in
  `Notes`.
- `⏸` — the engine refused the window. Nothing was read.

**Fields:** `Built` · `Notes` · `Follow-ups` · `Next`

`Built` is the window and the counts — projects, specs, commits — and the
page's path when one was rendered. `Notes` carries the digest's own closing
lines (`cannot tell`, torn-down worktrees counted elsewhere) and, when no page
was asked for, that `--page` renders one. `Next` is the one
in-flight action the standup put first, or `nothing in flight`.

**`Follow-ups` is always `none` here.** This skill reports work; anything it
notices belongs to the spec it is about.
