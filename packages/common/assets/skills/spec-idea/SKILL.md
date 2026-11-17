---
name: spec-idea
description: Capture an idea for a future spec without specing it — one step, no grilling — somewhere the team can see it (the tracker when a provider holds ideas, else specs/ideas.md on the base branch). Bare, it lists the ideas waiting; --drop discards one. Use when the user says "/spec-idea", "note this idea", "park this for later", "add to the ideas list", "what ideas do we have", or wants to get a thought down without writing a spec.
---

# /spec-idea — capture now, spec later

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

`/spec` grills until there is a spec. That is right for work and wrong for a
passing thought, which then gets specced too early or not written down at all.
This skill is the other door: it files the thought as it stands, and the grill
happens later, when someone promotes it with `/spec`.

**The engine decides where an idea lives — never you.** `skitterspec idea`
uses the tracker when the installed provider holds ideas (an issue kept off the
board), and `specs/ideas.md` on the base branch when there is no provider or
the provider says it cannot. A configured provider that says nothing is
cannot-tell, and the engine refuses rather than splitting ideas across two
stores. Relay what it decided; do not second-guess it.

## 1. Pick the mode from the arguments

| Invocation | Mode |
|------------|------|
| `/spec-idea <text>` | capture |
| `/spec-idea` (bare), "what ideas do we have" | list |
| `/spec-idea --drop <ref> [reason]` | drop |

## 2. Capture

**Ask nothing by default.** Getting the thought out of someone's head is the
whole point, and every question is a reason not to bother.

**One judgement, made once.** Read the text. If it is asking for design rather
than recording a thought — questions addressed to you, "suggestions welcome",
several alternatives left open for someone to weigh — it wants the grill now.
Offer the choice once, with a picker:

- **Grill it now with `/spec`.** Invoke `/spec` and seed it with the text. The
  idea is not filed, because the spec will record it.
- **File it as an idea.** File it exactly as typed.

A short or rough thought is not a design question. When in doubt, file it: an
idea can always be promoted, but a grill that nobody asked for is the cost this
skill exists to remove.

To file it, pass the text as **one argument**, newlines included. The first
line becomes the title and the rest becomes the body:

```
skitterspec idea add "<text>" --json
```

**Never push.** On the file store the engine commits onto the base branch and
prints the push instead of running it, because a push publishes the base
branch and that is always the operator's call.

**A refused capture loses nothing.** The engine prints the text back. Put it in
the `Why` row verbatim so the user can copy it.

## 3. List

```
skitterspec idea list
```

Relay the ideas as a table in the body of the message, one row per idea:
title, date, and the handle that promotes it. That is `/spec idea:<id>` for a
file idea, and `/spec #N` (or the provider's own reference) for a tracker idea.
An empty list is an answer, so say it is empty.

## 4. Drop

```
skitterspec idea drop <ref> --reason "<reason>"
```

Pass the reason when one was given. **Do not ask for one** — dropping a
thought should cost no more than having it. On the tracker the idea is closed
as not planned. In the file the entry is removed and the reason goes in the
commit, where git keeps it.

## Promotion is `/spec`'s, not this skill's

`/spec idea:<id>` or `/spec #N` turns an idea into a spec. It seeds the grill
from the idea and retires the idea once the spec exists. This skill never
writes a spec.

## Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here. In list mode the
table of ideas is the body of the message, and the block follows it.

**Verdicts**

- `✅` — an idea was filed or dropped, or the list was read (an empty list
  included).
- `⏸` — the engine refused, so nothing was written. Name the reason in `Why`,
  with the text when it was a capture.
- Handing off to `/spec` emits no block here: that skill ends with its own.

**Fields:** `Tracker` · `Built` · `Landed` · `Follow-ups` · `Next`

`Tracker` is the idea's issue, when the provider holds it. `Built` is what
happened: the idea's id and title, where it went, or the count listed.
`Landed` covers the file store only: the commit on the base branch and
`not pushed · <the push it printed> publishes it`. `Next` is the handle that
promotes the idea (`/spec idea:<id>`, `/spec #N`), or `none` after a drop.

**`Follow-ups` is always `none` here.** An idea is the follow-up.
