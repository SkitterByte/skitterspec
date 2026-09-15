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

A verdict sentence, a blank line, then a two-column table:

✅ **Phase 2 built** — `feat-foo`, 2 of 4

| | |
|---|---|
| **Tracker** | [ABC-88](https://example.invalid/ABC-88) · `feat-foo` · phase 2 moved |
| **Branch** | `spec/feat-foo` · 3 commits, clean |
| **Built** | POST /orders handler, orders schema |
| **Tests** | 128 passed · npm test |
| **Review** | 7 files, +212 −18 · [open the page](file:///…) — want a written review before you commit? |
| **Follow-ups** | none |
| **Next** | `/spec-next` → phase 3 (Auth) |

**A table, and never a fenced block.** An aligned label column is only
achievable inside a fence, because markdown collapses runs of spaces outside
one — so alignment and being recognised as a report are mutually exclusive, and
the report wins. A fence renders as the same grey box as a code sample, and a
reader who has been shown code all session reads one more box as code: the first
person to receive one of these did not register it as output at all, and missed
the `Next` row inside it. That is the exact scanning failure this contract exists
to fix, so producing it in the contract's own format is not a cosmetic mistake.

**The verdict sentence** is `<state> **<one clause>** — <spec>, <where it got
to>`. The clause says what happened; the tail says to what, and how far. Name
the skill in the clause when the run's identity is not obvious from the
conversation — a refusal, or a skill invoked by another. A run with no spec to
name drops that segment rather than inventing one.

**The header row is empty.** The labels are the left column, and a header over
them would only be able to say "field", which no one needs told.

**The block is the last thing in the message.** Nothing follows it — not a
closing line, not a next step, not the offer. Everything the reader must act on
is a row, which is what earns the block its position.

**And that is a rule about the destination, not only the prohibition.** It was
stated plainly and broken repeatedly, by runs that had something worth saying
and nowhere in the block to say it — so the paragraph went after the table,
where it buried the rows it was meant to sit beside. A missing destination reads
as a rule that does not fit the work, and a rule that does not fit gets ignored.
So: **if it is worth telling the reader, it is a row.**
**If it is not a row, it is not worth telling them.**
`Notes` is the row most of that content belongs in.

**Two controls may follow the block, and nothing else ever.** The ban exists
because *prose* after the block competes with it for the reader's attention and
loses them the rows. A control does not compete: it is a row made actionable, in
the place the reader's eye already finishes. Prose after either of them is the
same violation wearing a control's clothes.

**The first is a picker.** Where the run ends in a choice the reader must make,
the options may be offered after the table.

**The second is the review call-to-action**, and only where the run is actually
**waiting** on a verdict. It is a banner, not a sentence:

---

## ⏸ Review ready — 7 files, +212 −18

**[Open the page](http://…)** · I'm holding here until you send a verdict.

`/spec-reviewed` picks it up · `spec-env review skip "<reason>"` moves on

---

A rule, a heading naming the state and the size, the link in bold, one line
saying the run is stopped, and the two exits. Nothing else, and never a
paragraph explaining it.

**Only promise a wait the transport can deliver.** A page the engine SERVES
hands its pass to the local store, which a file-watch sees — that is the one
case where *"I'm holding here"* is true. A **published** page writes to the
artifact's own store, and nothing pushes from there into the conversation, so a
verdict pressed on it is invisible until someone asks for it. Its banner says
so instead:

**[Open the page](https://…)** · press a verdict, then type `/spec-reviewed` — I cannot see it until you do.

Offering both links under a line that claims to be holding is the failure this
exists to prevent: it was done, a verdict was pressed on the published page
three times, and each one sat unread while the run reported that it was
waiting.

**This is not the old failure returning**, and the difference is the whole
justification. The offer used to be two quoted lines in the tail of a long
report, addressed to nobody, under a closing line that told the reader to move
on — and it was never once taken. It was moved into a labelled row to make it
findable, and that worked. What changed since is that the run now *waits*: the
reader is not being offered something optional, they are being told the work has
stopped until they answer. A row cannot carry that, because a row is scanned at
the same weight as every other row. So the state gets the loudest shape on
screen, at the end, where reading finishes.

**Where the run is not waiting, it stays a `Review` row.** A render nobody is
being held for — a mid-phase `/spec-diff`, a page produced alongside other work
— is a convenience, and giving it a banner teaches the reader to scroll past
banners. The shape marks the difference between *here is a page* and *nothing
proceeds until you answer*.

**Never fence a message to the reader.** A fenced block is for a command to
run, code, or engine output quoted verbatim — things the reader copies or
compares. A question, an offer, a hand-off is prose. The same mechanism that
made the old report unreadable applies to anything else in a grey box: it is
read as an artefact to skim rather than as something addressed to someone, so a
question inside one goes unanswered and an instruction inside one goes unread.

**It reports this run and nothing else.** Not what else is in flight, not the
other worktrees, not the backlog, not the state of the repo at large. A reader
finishing one piece of work cannot tell whether a line about some other spec is
a consequence of what just happened or an unrelated aside, and has to stop and
work it out — which is the cost this block exists to remove. If they want the
wider picture there is a skill that answers it; volunteering it here muddies the
one thing they asked about.

`Next` is the single next action **for this work**, not a menu of what else
could be done.

**And it must be runnable from the state the run actually leaves behind.** Most
of these skills deliberately do not commit — they finish, verify, and wait — so
the tree they hand back is dirty, and several of the commands they would name
next refuse on a dirty tree. A `Next` that omits the commit therefore sends the
reader to a refusal: `/spec-next` leaves a phase uncommitted and its own §2
refuses on exactly that, and `/spec-bug` leaves a fix uncommitted where
`/spec-complete` refuses the same way. Where the skill does not commit, the row
says `/commit, then <the thing>`.

This is not a style rule. `Next` is the one row a reader is meant to act on, and
it closes the block because the closing row should be the one that moves the
work on. A row that cannot be run spends the trust the position was designed to
earn — and the two skills that got it wrong got it wrong independently, which is
what makes it a missing constraint rather than two slips.

## Field vocabulary, in this order

A skill emits only the fields it declares, in this order, skipping the rest.
`Follow-ups` is the exception: always present, second to last.

`Tracker` is the conditional one: a skill may declare it and still never emit
it, because no ticketing provider is installed. That is an absence with nothing
behind it — say nothing rather than reporting that there was nothing to report.

| Field | Carries |
|-------|---------|
| `Tracker` | **First.** The ticket id, linked where the spec has a url, the spec's folder name beside it, and what changed there. |
| `Why` | **Non-`✅` only.** What stopped it, in one clause. |
| `Branch` | Branch name, commit count, clean or dirty. |
| `Spec` | The spec document's own state: status, bucket, phase. |
| `Cause` | The root cause, for work that diagnosed one. |
| `Built` | What the run produced — the code, the edits, the spec written. |
| `Tests` | The result and the command that produced it. |
| `Notes` | What this run hit and handled — one short paragraph. Named `Snags` once, which announced a problem before the reader had read one; most of what belongs here is neither good nor bad, just worth knowing. A wrong turn, a guard that fired, a check of yours that turned out to be a false negative. Not a caveat on the outcome (`⚠️` and `Why` carry those) and not future work (`Follow-ups` carries that): this is what happened on the way. |
| `Landed` | A fast-forward, a tag, a cherry-pick. |
| `Worktree` | A worktree provisioned, entered, or torn down. |
| `Untouched` | Uncommitted work the run deliberately left alone — whose, and how much. |
| `Review` | The rendered diff page: files, `+`/`−`, the link — and the offer of a written review, in the same row. **Omitted entirely when the run is waiting on a verdict**: the banner after the block carries it instead, and a row saying the same thing beside it splits the reader's attention across two places. |
| `Follow-ups` | **Always.** `none`, or one line each. |
| `Next` | **Last.** The single next action for this work — runnable from the state the run leaves behind. |

The order runs identity → context → what happened → where it went → what to do.
**`Tracker` is first** because the id is what addresses this work outside the
repo, and **`Next` is last** because it is the only row the reader acts on: the
closing row should be the one that moves the work on.

**`Untouched` is a fact, not a caveat.** A run that provisions beside another
spec's uncommitted work has done nothing wrong and nothing partial — it left
alone something that was never its business — so it stays `✅` with a row, and
does not become `⚠️`. Several specs in flight at once is what the worktree mode
is *for*; spending the "something is worth knowing" verdict on the normal case
is how that verdict stops meaning anything. It is still reported rather than
silent, because "I provisioned, and your four files are still sitting there" is
a different sentence from "I provisioned".

**`Review` is one row, not two** — and where the run is waiting, it is no rows
at all. The page and the offer to read it are the same subject, and splitting
them made the reader resolve a distinction before acting on either. A waiting
run promotes the whole subject into the banner; keeping the row as well would
recreate that split with the two halves further apart than ever.

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

One place only. A non-`✅` verdict adds a `Why` row, and quotes the output that
justifies it — the failing assertion, the conflict, the engine's refusal — in a
fenced block **above** the table, where a fence means what a fence should mean:

```
✖ rejects a negative quantity
  expected 422, got 500
```

❌ **Phase 2 stopped — tests red** — `feat-foo`, 2 of 4

| | |
|---|---|
| **Why** | 3 assertions fail in `orders.test.js`; nothing committed |
| **Branch** | `spec/feat-foo` · 2 commits, dirty |
| **Built** | POST /orders handler, orders schema |
| **Tests** | 125 passed, 3 failed · npm test |
| **Follow-ups** | none |
| **Next** | fix the failures, then `/spec-next` to finish phase 2 |

Everywhere else the block stays the size it is. Prose after it, an extra row of
your own invention, a second block — all three are the shape drifting back to
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
- 2026-01-09 — Follow-up surfaced: connect's port picker assumes a free
  canonical port; not in scope here.
```

**Say where the spec would be written.** These skills run inside the spec's own
worktree, and a spec authored there physically lives on that branch — invisible
from the base branch, and cancelled along with its host if the host is
cancelled. So the offer names the primary checkout as the place to write it.
`spec-planning.md` and `commit-trailers.md` carry the reasoning.

## Worked examples

**`⚠️` — it finished, with something worth knowing.**

⚠️ **Phase 3 built; tracker not updated** — `feat-foo`, 3 of 4

| | |
|---|---|
| **Branch** | `spec/feat-foo` · 4 commits, clean |
| **Built** | Auth middleware, session table |
| **Tests** | 140 passed · npm test |
| **Follow-ups** | Session expiry is read from two places; phase 4 leans on one |
| **Next** | `/spec-next` → phase 4 (Docs) |

**`⏸` — refused, nothing changed.**

⏸ **`/spec-next` refused — no spec in flight**

| | |
|---|---|
| **Why** | Not standing in a worktree, and 2 specs are provisioned |
| **Follow-ups** | none |
| **Next** | `/spec-start <name>`, or `cd` into `../repo-wt/feat-orders` or `../repo-wt/feat-auth` |

**`✅` — a spec finished and landed.**

✅ **Landed and torn down** — `feat-foo`, complete

| | |
|---|---|
| **Tracker** | [ABC-88](https://example.invalid/ABC-88) · `feat-foo` · moved to its done state |
| **Spec** | Complete · `specs/complete/feat-foo` |
| **Tests** | 131 passed · npm test |
| **Landed** | base fast-forwarded to 4a1c9e2 |
| **Worktree** | removed · `../repo-wt/feat-foo` |
| **Follow-ups** | none |
| **Next** | pick the next spec from `specs/backlog/` |

The `❌` example is in **Where the block may grow** above, since the failing
output it quotes is the thing that example exists to show.
