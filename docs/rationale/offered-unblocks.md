# offered-unblocks — rationale and history

This is the full text of `.claude/rules/offered-unblocks.md` as it stood before
feat-rules-budget trimmed it. The installed rule now holds the instructions
only. This copy keeps the reasoning and the incidents behind it, for
maintainers. It is not installed and is not updated.

---

# Offered Unblocks

A refusal says what is wrong. Some refusals can also say **what would fix it**,
and where the engine declares that, a skill may offer it rather than leaving the
operator at a dead end.

This file is the whole contract. A skill's own text says only *that* it acts on
an offer, never how.

## The engine declares; the skill relays

An offer is a field on a refusal, never a judgement a caller makes from the
reason text:

```json
{
  "blocked": true,
  "reason": "feat-x's worktree has uncommitted changes — commit or stash them…",
  "offer": { "kind": "satisfy", "label": "Commit first, then go live", "command": "/commit" }
}
```

**Absent stays absent.** Most refusals carry no `offer` at all, and that is the
correct, common answer. Where there is none, relay the refusal and stop.

**Never infer one.** If the engine did not declare an offer, there is not one —
however obviously the reason seems to name a fix. The boundary that matters most
lives in that decision, and it must not be re-litigated per skill:
**work that is not the operator's is never offered up.** A live workbench another
spec holds is that spec's operator's to free, so it declares nothing, and a
helpful picker is exactly how that would creep back in.

## Two kinds

| `kind` | Means | Recorded |
|--------|-------|----------|
| `satisfy` | do what the guard asked for | no — nothing was weakened |
| `bypass` | step past a guard still unsatisfied | **yes** |

## Relay first, then offer

In that order, and never instead. A picker that replaced the refusal would hide
what is wrong behind a choice about what to do next — and the refusal text is
where every exit is named, including the ones the picker does not offer.

Then, only where `offer` is present, put **two** options to the operator: the
offer's `label`, and Cancel.

- **`satisfy`** — run the command, then retry the original operation.
- **`bypass`** — run the command, then carry on.
- **Cancel** — stop. Record nothing: declining to bypass is not a decision
  anyone needs to audit.

**The label is the engine's, shown verbatim.** Never reword a bypass into
something easier-sounding, never pre-select it, and never add a third option. A
bypass that arrives pre-selected is a bypass by default wearing a question mark.

### A worked `satisfy`: the gap between release branches

Under `baseBranchPattern`, a base nobody can resolve refuses — and where the
last release branch has merged and the next is not yet cut, that refusal is the
normal state of the repo for a while, not a mistake. So the engine declares:

```json
{
  "blocked": true,
  "reason": "no branch matches 20??/Q? — run spec-env base to fetch",
  "offer": { "kind": "satisfy", "label": "Use master as the base for now", "command": "skitterspec spec-env base --use-fallback" }
}
```

Text output carries the same thing as an `offer:` line under the refusal. On
the pick, run the command and retry the command that refused. It is `satisfy`
because it gives the guard what it asked for — a base — and the pick is kept as
a local pin that every command then honours, so it is asked once per gap rather
than once per command. The pin clears itself when a branch matches again, so
nothing about it needs recording. No fallback resolvable means no `offer`, and
the refusal stands alone.

## A bypass is offered once per obligation

The engine enforces this; a skill does not count anything. Spend the offer by
recording it **when you raise the picker**:

```
skitterspec spec-env review gate <spec> --offered
```

After that the gate declares no offer for the same arming, so the next refused
commit is a plain refusal with its exits named in the text. A new phase ending
arms the gate again and is asked in its own right.

**Spent by being made, not by being taken.** An operator who declines still saw
it, and re-offering on every attempt is how a deliberate step becomes the
default.

**Do not spend it by reading.** `review gate --json` is asked on every
`/spec-next` run; only raising the picker spends the offer.

## What this is not

**Not a `--force`.** One was asked for and rejected: a reasonless lift is
indistinguishable from nobody having looked, where
`none: additive, nothing to revert` is a decision a reviewer can argue with. The
gate's exits are unchanged — a committing verdict, or a recorded skip — and a
bypass is the second of those at an address a person will reach.

**Not a replacement for the refusal.** A picker exists only in a harness. The
engine and the `PreToolUse` hook keep refusing regardless, so this is a layer on
top of a guard and never the guard itself.

**Not Claude lifting a guard aimed at Claude.** `spec-planning.md` draws that
line for `/allow-main` and `/spec-skip`, and a bypass offer survives it because
three things hold at once, where a `--force` had none of them:

1. **The operator answers.** Claude may raise the question and cannot answer it.
2. **The choice is recorded** — a fixed reason, distinct from anything typed,
   which shows on the next render as history.
3. **It is offered once**, held by the sidecar rather than by prose, so it
   survives a `/clear`, a compaction and a fresh session.

Remove any one of those and the objection returns.
