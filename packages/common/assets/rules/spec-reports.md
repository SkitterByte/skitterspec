# Spec Reports

Every lifecycle skill ends with the same block. This file is its whole
definition — a skill's `## Report` section names only which fields it emits and
any behaviour that was always there.

Two things it buys: a run's outcome is scannable in one shape rather than
composed fresh each time, and "nothing happened" becomes a reported outcome
instead of an absent one.

## Silence during the run

**Do not narrate.** Not what you are about to do, not why, not which step you
are on. The tool calls are already on screen, so a line per step re-states the
transcript in words that never vary.

Speak mid-run for exactly two reasons:

- **A question you cannot answer yourself** — a decision the spec left open, a
  confirmation a guard demands, an ambiguity with more than one defensible
  answer.
- **A failure, at the moment it happens** — a red test, a refused command, a
  conflict. Say it where it occurs; do not hold it back for the block.

Everything else waits.

## The block

A verdict line, a blank line, then an aligned key-value list:

```
✅ /spec-next · feat-foo · phase 2/4

Built       POST /orders handler, orders schema
Tests       128 passed · npm test
Branch      spec/feat-foo · 3 commits, clean
Diff        .spec-env/reviews/feat-foo.html
Next        /spec-next → phase 3 (Auth)
Follow-ups  none
```

**A list, never a table.** These get read on a phone, where a two-column
markdown table reflows into noise and a label column does not.

**The verdict line** is `<state> /<skill> · <spec> · <one clause>`. The clause
says where the run got to — a phase, a folder move, a landing, a refusal. A run
with no spec to name drops that segment rather than inventing one.

**Labels** come from the vocabulary below, left-aligned, values starting at
column 13 — two spaces past `Follow-ups`, the longest of them. One line each; a
value that needs more indents its continuation to the same column.

## Field vocabulary, in this order

A skill emits only the fields it declares, in this order, skipping the rest.
`Follow-ups` is the exception: always present, always last.

`Tracker` is the other conditional one: a skill may declare it and still never
emit it, because no ticketing provider is installed. That is an absence with
nothing behind it — say nothing rather than reporting that there was nothing to
report.

| Field | Carries |
|-------|---------|
| `Why` | **Non-`✅` only.** What stopped it, in one clause. |
| `Cause` | The root cause, for work that diagnosed one. |
| `Built` | What the run produced — the code, the edits, the spec written. |
| `Tests` | The result and the command that produced it. |
| `Spec` | The spec document's own state: status, bucket, phase. |
| `Branch` | Branch name, commit count, clean or dirty. |
| `Landed` | A fast-forward, a tag, a cherry-pick. |
| `Worktree` | A worktree provisioned, entered, or torn down. |
| `Tracker` | What the mirror now says, or why it was skipped. |
| `Diff` | The review page, as a path or a URL. |
| `Next` | The command to type next. |
| `Follow-ups` | **Always.** `none`, or one line each. |

## The four verdicts

| State | Means |
|-------|-------|
| `✅` | Done. Everything the skill set out to do happened. |
| `⚠️` | Done with caveats — it finished, but something is worth knowing. |
| `❌` | Failed part-way. It acted, and the repo is mid-something. |
| `⏸` | Refused before acting. Nothing changed. |

**`❌` and `⏸` are different facts about the repo**, and the difference decides
what happens next. A failed landing leaves a conflicted rebase and a standing
worktree — there is a mess to clear. A refusal leaves nothing at all, and the
only thing to do is supply what was missing. Collapsing them sends people
looking for wreckage that is not there, or past wreckage that is.

**A refusal still emits the block.** That is the point of having four states:
every invocation ends the same way, so an outcome is never inferred from
silence.

## Where the block may grow

One place only. A non-`✅` verdict adds `Why`, and quotes the output that
justifies it — the failing assertion, the conflict, the engine's refusal —
below the list, verbatim and unparaphrased:

```
❌ /spec-next · feat-foo · phase 2 tests red

Why         3 assertions fail in orders.test.js; nothing committed.
Built       POST /orders handler, orders schema
Tests       125 passed, 3 failed · npm test
Branch      spec/feat-foo · 2 commits, dirty
Next        fix the failures, then /spec-next to finish phase 2
Follow-ups  none

  ✖ rejects a negative quantity
    expected 422, got 500
```

Everywhere else the block stays the size it is. Prose above it, prose below it,
an extra field of your own invention — all three are the shape drifting back to
what this replaced.

## Follow-ups

**Always present.** A recorded `none` is a decision; a missing line is an
oversight — the same logic as the `Gating` header.

The bar is deliberately high. A follow-up is something *this* work surfaced
that *this* spec will not fix — a wrong assumption, a missing guard, a decision
the spec deferred and the code then leaned on. It is **not** "could be tidier",
and it is **not** anything already sitting in the spec's Open questions.

When there is one, **offer to `/spec` it on the spot**. If the user does not
take the offer, write one dated line into the spec's Changelog before you
finish, so it outlives the session:

```
- 2026-09-13 — Follow-up surfaced: connect's port picker assumes a free
  canonical port; not in scope here.
```

**Say where the spec would be written.** These skills run inside the spec's own
worktree, and a spec authored there physically lives on that branch — invisible
from the base branch, and cancelled along with its host if the host is
cancelled. So the offer names the primary checkout as the place to write it.
`spec-planning.md` and `commit-trailers.md` carry the reasoning.

## Worked examples

One per verdict, short enough to read whole.

**`✅` — a phase built.**

```
✅ /spec-complete · feat-foo · landed and torn down

Spec        Complete · specs/complete/feat-foo
Tests       131 passed · npm test
Landed      main fast-forwarded to 4a1c9e2
Worktree    removed · ../repo-wt/foo
Tracker     ABC-88 → Done
Next        /spec-list to pick the next one
Follow-ups  none
```

**`⚠️` — it finished, with something worth knowing.**

```
⚠️ /spec-next · feat-foo · phase 3/4, mirror not updated

Built       Auth middleware, session table
Tests       140 passed · npm test
Branch      spec/feat-foo · 4 commits, clean
Tracker     push failed — tracker unreachable (ENOTFOUND); repo is correct
Next        /spec-next → phase 4 (Docs)
Follow-ups  Session expiry is read from two places; phase 4 leans on one
```

**`❌` — it acted and stopped part-way.** See the block above, which is the
example: `Why` first, the fields it got to, and the failing output quoted
beneath.

**`⏸` — refused, nothing changed.**

```
⏸ /spec-next · no spec in flight

Why         Not standing in a worktree, and 2 specs are provisioned.
Next        /spec-start <name>, or cd into one of:
              ../repo-wt/feat-connect-planner
              ../repo-wt/feat-review-verdict
Follow-ups  none
```
