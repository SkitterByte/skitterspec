---
name: spec-reviewed
description: Pick up the review you approved on the page — read what is waiting, name its code back to you, and on your word claim it and act on its verdict. Use when the user says "/spec-reviewed", "I approved it", "I've reviewed it", "pick up my review", "I pressed approve", or otherwise says they have finished reviewing a rendered diff.
disable-model-invocation: true
---

# /spec-reviewed — pick up the review you just approved

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

You read the diff somewhere else, pressed a verdict, and the engine is holding
the pass. This is how it gets picked up.

## Why this is user-only, and why that is the whole point

`disable-model-invocation: true` is not ergonomics here — it is the enforcement
of `/spec-diff` step 0's central rule:
**never claim a pass you were not asked to claim**.

That rule exists because a review pass can be POSTed by anything that reaches
the page, and what it cannot reach is **this conversation**. So a stranger's pass
sits in the holding area forever — unless an agent goes and fetches it, which is
exactly what happened once: an agent found a waiting approval, read its code off
disk, claimed it, and reported the round-trip working.

Prose alone did not prevent that. The harness does —
**the model cannot invoke this skill** — so a pass is only ever picked up
because a person typed the command. Typing it *is* the human signal. A later edit that makes this skill
model-invocable does not make it more convenient — it removes the only thing
standing between a stray approval and someone's repo.

## 1. Resolve the spec

Bare, exactly as every other bare command in this workflow: the worktree you are
standing in, else the sole provisioned spec. Ask the engine rather than guessing:

```
skitterspec spec-env resolve
```

Several provisioned and none resolved is a refusal — relay its list and stop,
never pick from it. See `.claude/rules/spec-planning.md`; do not restate the
rule here.

A **name** or a **tracker id** targets a different spec — that is phase 2 of
`feat-spec-reviewed`, and until it lands a bare invocation is the whole command.

## 2. Read what is waiting

```
skitterspec spec-env review <spec>
```

Its `pending:` block lists each waiting pass — code, verdict, age:

```
pending: 1 waiting
  792969 · approve · 1 min ago
```

**Never open `.spec-env/reviews/<spec>.pending.json`.** The render carries
everything a decision needs, so there is nothing to go looking for, and going
looking is the bypass step 0 forbids. The file is right there and readable; that
is precisely why the rule is written down rather than assumed.

**Nothing waiting is an ordinary answer.** Say so and stop. Do not hunt through
other specs, and do not treat an empty holding area as a problem — a `file://`
page copies to the clipboard instead of sending, so mention that the pass may be
on their clipboard waiting to be pasted, and finish.

## 3. Offer it — name the code, and wait

**Name the code.** It is the only part the operator can check against their
screen; a stranger's approval and their own read identically otherwise.

*"An approval is waiting, code 792969, sent a minute ago — does that match your
phone?"*

**Two or more waiting is a refusal to guess.** Name them all, with verdicts and
ages, and ask which. Never take the newest, the oldest, or the only `approve` —
that is the case where someone else's pass is sitting beside theirs, and it is
the only case where reading six digits out is worth anyone's time.

**On "that isn't mine"**, leave it and offer to drop it:

```
skitterspec spec-env review <spec> --drop <code>
```

A pass that stays is reported on every render until the operator stops reading
the line — which is how the real one gets missed.

## 4. On their word, claim it and act

```
skitterspec spec-env review <spec> --claim <code>
```

Then **route on the verdict exactly as `/spec-diff` §2 does** — its steps 2, 2a
and 4 own that routing, including the commit hand-off through
`review.commitWith`. Follow it; do not restate it here, because two copies of a
routing rule is how the two come to disagree.

A claim is a **delivery mechanism, not a second kind of review**: a pass that
arrived this way means exactly what the same pass pasted into the chat would
mean.

## 5. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — a pass was claimed and its verdict acted on.
- `⚠️` — claimed and acted on, with something worth knowing.
- `❌` — it acted and stopped part-way; the commit failed, or the work did.
  Quote it.
- `⏸` — nothing was waiting, or the operator said the waiting pass was not
  theirs. Nothing changed, and neither is a failure.

**Fields:** `Tracker` · `Branch` · `Built` · `Tests` · `Follow-ups` · `Next`

`Built` is what the verdict produced — the commit, or the commented files
worked. A run that claimed nothing built nothing and omits it.
