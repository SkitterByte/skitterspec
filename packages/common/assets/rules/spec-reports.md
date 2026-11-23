# Spec Reports

Every lifecycle skill ends with the same block. This file defines it. A skill's
`## Report` section names only its verdicts and the fields it emits.

## Silence during the run

**Do not narrate.** The tool calls are already on screen. Speak mid-run for
exactly two reasons:

- **A question you cannot answer yourself**: a decision the spec left open, a
  confirmation a guard demands, or a real ambiguity.
- **A failure, when it happens**: a red test, a refused command, a conflict.

Everything else waits for the block.

## The block

A verdict sentence, a blank line, then a two-column table with an empty header
row:

✅ **Phase 2 built** — `feat-foo`, 2 of 4

| | |
|---|---|
| **Tracker** | [ABC-88](https://example.invalid/ABC-88) · `feat-foo` · phase 2 moved |
| **Branch** | `spec/feat-foo` · 3 commits, clean |
| **Built** | POST /orders handler, orders schema |
| **Tests** | 128 passed · dotnet test |
| **Follow-ups** | none |
| **Next** | `/commit, then /spec-next` → phase 3 (Auth) |

- **A table, never a fenced block.** A fence reads as code and gets skipped.
- **The verdict sentence** is `<state> **<one clause>** — <spec>, <where it got
  to>`. Name the skill in the clause when that is not obvious (a refusal, a
  skill run by another). Drop the spec segment when there is no spec.
- **The block is the last thing in the message.** If something is worth telling
  the reader, it is a row (usually `Notes`). If it is not a row, leave it out.
- **Only two controls may follow it**: a picker, where the run ends in a choice
  the reader must make, and the **review banner**, only when the run is actually
  waiting on a verdict. The banner, its tier stack and the wait are defined in
  `.claude/skills/spec-diff/review-wait.md`. Read it before rendering one.

**Asking implies waiting.** A render that asks the reader for a verdict ends the
turn waiting for one, under the banner. A run that is not going to wait does not
ask: it reports the page in a `Review` row with the counts and the link, and no
question.

**Never fence a message to the reader.** Fences are for commands, code and
engine output quoted verbatim. A question, an offer or a hand-off is prose.

**Report this run only.** Leave out other specs in flight, other worktrees and
the backlog.

**`Next` is the single next action for this work**, and it must be runnable
from the state the run leaves behind. Where the skill did not commit, write
`/commit, then <the thing>`.

### Open manual steps are rows

When the next action includes steps only a person can do and some are still
open, `Next` lists every one of them, one per row. The label goes on the first row
only, each step gets its own row, and a closing row says what comes after:

| | |
|---|---|
| **Follow-ups** | none |
| **Next** | `/spec-live`, then: |
| | 1. Open Settings → Business Unit Setup |
| | 2. Set one process up, press **Check again**; its card turns ✓ |
| | then `/spec-next` to finish phase 5 |

Copy them from the phase file, never from an earlier message.
A count is not a list ("run the seven steps"), and neither is the file's path.
This applies to every skill's block.
A report with no open manual steps keeps its one-row `Next`.

## Field vocabulary, in this order

Emit only the fields the skill declares, in this order. `Follow-ups` is always
present, second to last. `Tracker` appears only when a ticketing provider is
installed. Without one, emit nothing and do not mention it.

| Field | Carries |
|-------|---------|
| `Tracker` | **First.** The ticket id, linked where there is a url, the spec folder name, and what changed there. |
| `Why` | **Non-`✅` only.** What stopped it, in one clause. |
| `Branch` | Branch name, commit count, clean or dirty. |
| `Spec` | The spec's own state: status, bucket, phase. |
| `Cause` | The root cause, for work that diagnosed one. |
| `Built` | What the run produced. |
| `Tests` | The result and the command that produced it. |
| `Notes` | What this run hit and handled, in one short paragraph. This is not a caveat on the outcome (`⚠️` and `Why` carry those) and not future work. |
| `Landed` | A fast-forward, a tag, a cherry-pick, or the PR: `PR #14 (draft) updated` · `PR #14 merged` · `held — not pushed` · `not pushed · <command> publishes it`. |
| `Worktree` | A worktree provisioned, entered or torn down. |
| `Untouched` | Uncommitted work the run deliberately left alone: whose, and how much. This is a fact, not a caveat, so the verdict stays `✅`. |
| `Review` | The rendered page: files, `+`/`−`, and every tier of the engine's stack joined with `·`, plus `live` where reported. **Asks nothing.** **Omitted when the run is waiting**, because the banner carries it. |
| `Follow-ups` | **Always.** `none`, or one line each. |
| `Next` | **Last.** The single next action for this work. |

## The four verdicts

| State | Means |
|-------|-------|
| `✅` | Done. Everything the skill set out to do happened. |
| `⚠️` | Done with caveats: it finished, but something is worth knowing. |
| `❌` | Failed part-way. It acted, and the repo is mid-something. |
| `⏸` | Refused before acting. Nothing changed. |

`❌` and `⏸` are different facts about the repo. `❌` leaves a mess to clear;
`⏸` leaves nothing. **A refusal still emits the block.**

## Where the block may grow

`Next` takes a row per open manual step. A non-`✅` verdict adds a `Why` row and
quotes the output that justifies it in a fenced block **above** the table:

```
✖ rejects a negative quantity
  expected 422, got 500
```

❌ **Phase 2 stopped — tests red** — `feat-foo`, 2 of 4

| | |
|---|---|
| **Why** | 3 assertions fail in `test_orders.py`; nothing committed |
| **Tests** | 125 passed, 3 failed · pytest |
| **Follow-ups** | none |
| **Next** | fix the failures, then `/spec-next` to finish phase 2 |

Do not add prose after the block, invent rows, or emit a second block.

## Follow-ups

**Always present.** A recorded `none` is a decision; a missing line is an
oversight. A follow-up is something this work surfaced that this spec will not
fix. "Could be tidier" is not a follow-up, and neither is anything already in
the spec's Open questions. When there is one, offer to `/spec` it on the spot.
If the offer is declined, write one dated line into the spec's Changelog:

```
- 2026-01-09 — Follow-up surfaced: connect's port picker assumes a free
  canonical port; not in scope here.
```

---

Why this contract is shaped this way, and the amendments behind it:
[docs/rationale/spec-reports.md](https://github.com/SkitterByte/skitterspec/blob/main/docs/rationale/spec-reports.md).
