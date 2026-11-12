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

Read its `steps`, `groups` and `freeLanes`. A step whose `where` is `new-tab`
is a member that may start now, in a free lane; its `command` is the
`/spec-start` to type and its `caution` any clash. Do not re-derive that from
`rows` or the headers. The engine decides what can start and caps it at the
free lanes, and it is the same answer the epic page and `/spec-epic` print.
Any second answer could disagree with them.

## 2. Route on what it said

**Every member done.** The only step has `where: epic`, and its `command` is
`/spec-complete <epic>`. Say so, `✅`.

**No free lane.** `freeLanes` is `0` and `groups.ready` is not empty. Stop with
`⏸`: the lanes are the cap the epic chose, and this skill does not offer a way
past it. Name the members in `groups.inFlight`, which are what is holding the
lanes. The in-tab steps say what each needs to finish.

**Nothing ready.** `groups.ready` is empty. Stop with `⏸` and name what each
member in `groups.waiting` waits on (its row's `next.why`). A member the engine
could not read is in `waiting` with its reason, never in `ready`
(`.claude/rules/negative-checks.md`), so quote that reason rather than
treating the wait as met.

**One start step.** Name it. `Next` is its `command`, in a new tab, with its
`caution` beside it.

**Several start steps.** Offer a picker — one option per start step, plus
Cancel — and **never choose for them**. A member with a `caution` is listed
**with** its clash, not filtered out: `Area:` is what a spec says it will
touch, and `/spec-start` §4c raises the clash again when it starts. The engine
already puts the start with no clash first, so keep its order. A choice ends
`✅` with that member in `Next`; Cancel ends `⏸`.

## Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — a member was named or picked, or every member is done and the epic
  itself is next.
- `⏸` — no free lane, nothing ready, a wait it cannot read, no epic resolved,
  or the picker cancelled. Nothing changed — and nothing ever does here.

**Fields:** `Spec` · `Follow-ups` · `Next`

`Spec` names the epic and how far along it is, from the engine's
`progress` (`N of M done · K in flight`). `Next` is `/spec-start <member>` **in a new tab**, or on a `⏸` the
thing that would unblock it. Where several are startable the picker is the
control after the block, and `Next` names it.
