---
name: spec-epic-next
description: Find the member of an epic that can start now and name the `/spec-start` to run for it in a new tab — asking which when several can, and saying why when none can. Reads only; it starts, provisions and moves nothing. Bare, it uses the epic or member worktree you are standing in. Use when the user says "/spec-epic-next", "start the next spec in the epic", "what's next in this epic", or has just completed an epic member.
---

# /spec-epic-next — which epic member to start next

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

An epic's members are built in tabs of their own, and the tab this runs in
stays whatever it was — the epic's coordinator, or a member that just finished.
So this skill **picks and prints**: its answer is `/spec-start <member>` to
type **in a new tab**. It writes nothing, provisions nothing, and moves no
session. Starting the member is `/spec-start`'s job, in that tab.

## 1. Ask the engine

```
skitterspec epic status [<epic>] --json
```

Pass the epic when the invocation names one. Bare, the engine resolves it from
the worktree you are standing in — the epic's own, or a member's (its
`> **Epic:**` header). When it resolves nothing (`epic: null`), stop with `⏸`
and name `/spec-epic-next <epic>` in `Next`, with the epics its `inFlight`
lists as the candidates. **Never pick an epic from conversation**: a
spec discussed is not the epic in hand, and the engine already knows where you
are standing.

Read its `rows`: each member's `next` carries a `verb`, a `command` and a
`why`. A **startable** member is one whose `next.verb` is `start`. Do not
re-derive that from headers — the engine decides what can start, and one
answer that can disagree with `/spec-epic` is one too many.

## 2. Route on what it said

**A wait it cannot read.** Any member with `next.verb` of `cannot-tell` that is
not yet started could be the one that should start. When **no** row is
startable and any is `cannot-tell`, stop with `⏸` and quote its `why` — never
treat an unreadable wait as met (`.claude/rules/negative-checks.md`).

**No free lane.** Where `freeLanes` is `0`, every startable row's `why`
carries `no free lane`. Stop with `⏸`: the lanes are the cap the epic chose,
and this skill does not offer a way past it. Name the members in flight — the
rows whose bucket is `in-progress` — so the reader can see what is holding
them.

**Nothing ready.** No startable row: stop with `⏸`, naming what each backlog
member waits on (its `why`). An epic whose members are all done is the one
exception — its own `next` is `/spec-complete <epic>`, so say that, `✅`.

**One startable.** Name it. `Next` is its `command`, in a new tab.

**Several startable.** Offer a picker — one option per startable member, plus
Cancel — and **never choose for them**. A member whose `why` says
`clashes with …` is listed **with** its clash, not filtered out: `Area:` is
what a spec says it will touch, and `/spec-start` §4c raises the clash again
when it starts. A choice ends `✅` with that member in `Next`; Cancel ends `⏸`.

## Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — a member was named or picked, or every member is done and the epic
  itself is next.
- `⏸` — no free lane, nothing ready, a wait it cannot read, no epic resolved,
  or the picker cancelled. Nothing changed — and nothing ever does here.

**Fields:** `Spec` · `Follow-ups` · `Next`

`Spec` names the epic and how far along it is, from the engine's own
headline. `Next` is `/spec-start <member>` **in a new tab**, or on a `⏸` the
thing that would unblock it. Where several are startable the picker is the
control after the block, and `Next` names it.
