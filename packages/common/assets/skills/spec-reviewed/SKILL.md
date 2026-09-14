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

A **name** targets that spec instead. A **tracker id** does too, but only
through a **provider seam**: the base knows nothing about tracker ids, so
resolve one by asking whichever provider is installed for its listing —

```
skitterspec spec-sync linked --json
```

— which answers `[{ spec, bucket, identifier }]`, and match on `identifier`.
**With no provider installed an id resolves to nothing**, and that is the right
answer rather than a guess: a `SKS-227`-shaped string is not evidence that a
tracker exists. Say the id matched no spec and stop.

## 1a. Targeting another spec? Get into its worktree first

**Only when the resolved spec's worktree is not where this session stands.**
Compare the `worktree:` line from `skitterspec spec-env resolve <spec>` against
cwd, resolving both paths first so a symlinked or trailing-slash spelling of one
tree does not read as two. **Same tree — say nothing and carry on.** That is the
ordinary case, and a line about it is narration.

**Different trees, and it matters for what comes after, not for the claim.**
Claiming is harmless from anywhere: the sidecar lives in the primary checkout.
But an honoured `commit` verdict **commits**, and `changes` **edits files**, and
both must land in *that spec's* worktree — done from here they would land in
this one, on the wrong branch, looking entirely normal at the time.

So **ask, then move**:

*"`feat-orders` lives in `../repo-wt/orders`, and picking its review up means
committing there — move this session over to carry on?"*

- **On a yes**, move with a plain `cd "<worktreePath>"`. That is the whole
  mechanism, exactly as `/spec-start` does it — not a tool call, because an
  approval prompt is unusable on a phone.
  Then **confirm the move landed** rather than assuming it
  (`.claude/rules/negative-checks.md` rule 1): run `skitterspec spec-env resolve`
  with no argument and check its `spec:` line names the target. If it does not,
  stop — do not claim a pass you are about to act on from a tree you could not
  confirm.
- **On a no, stop without claiming.** A pass claimed here and acted on there is
  exactly the split this guard exists to prevent, and claiming first would spend
  the code for nothing.

**A target with no worktree is a refusal.** There is nowhere for a commit to
land. Name it, suggest `/spec-start <name>`, and stop.

**Why not simply refuse unless you are on the base branch?** Because that bans a
legitimate case — standing in one spec, picking up another's review — while
*still* leaving the work to be done in a tree you are not in. The relocation is
needed either way, so the relocation is the guard.

## 2. Read what is waiting

```
skitterspec spec-env review <spec>
```

Its `pending:` block lists each waiting pass — code, verdict, age:

```
pending: 1 waiting
  792969 · commit · 1 min ago
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

*"A commit verdict is waiting, code 792969, sent a minute ago — does that match
your phone?"*

**Two or more waiting is a refusal to guess.** Name them all, with verdicts and
ages, and ask which. Never take the newest, the oldest, or the only `commit` —
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
`review.commitWith` and what `commit-continue` does after it. Follow it; do not
restate it here, because two copies of a routing rule is how the two come to
disagree.

That includes the one rule worth knowing before you invoke anything:
`commit-continue` runs `/spec-next` and **stops there**. It never completes,
lands or tears anything down.

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
- `⏸` — nothing was waiting, the operator said the waiting pass was not theirs,
  they declined the move to another spec's worktree, or the target has no
  worktree at all. Nothing changed, and none of those is a failure.

**Fields:** `Tracker` · `Branch` · `Built` · `Tests` · `Worktree` ·
`Follow-ups` · `Next`

`Worktree` appears only when this run **moved the session** — the path it moved
to, because the operator's next command depends on knowing where they now are.
A run that stayed put omits it.

`Built` is what the verdict produced — the commit, or the commented files
worked. A run that claimed nothing built nothing and omits it.
