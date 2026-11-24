# Autonomous runs — the loop `/spec-next` runs when nobody is stopping it

A spec whose run resolves to **auto** is built from its next phase to its last
without stopping for a verdict at each one. Every phase still gets its page,
kept as a snapshot the reader can open while the run carries on, and the run
ends where the operator chose: paused on one final page, pushed, or opened as
a PR. This file is the whole contract; `SKILL.md` says only when to follow it.

## Resolve once, at the start

```
skitterspec spec-env run resolve <spec> [--auto|--supervised] [--then pause|push|pr] --phase <first unfinished> --json
```

Pass through exactly the flags the operator typed, and nothing else. The
engine applies the precedence: flag > an active run > the spec's
`> **Run:**` header > `auto` in `env.config.json` > supervised.
**`mode: "supervised"` means this file does not apply.** Build the phase as `SKILL.md`
describes and stop on its page. A refusal (`ok: false`) is a typo in the flags.
Relay it with `⏸` and stop.

`mode: "auto"` opened (or resumed) the run record. Keep `then` and
`maxFixAttempts` from the answer. Naming `push` or `pr`, by flag or by config,
**is** the operator's consent to push for this run. Nothing else in the run
pushes.

## Each phase

Run `SKILL.md` §2–§4b exactly as written: pre-flight, epic check, blocker
check, mark started, tracker refresh, build, tests, record progress. Then the
two places it differs:

1. **Re-read before building.** Start each phase from the spec files and
   `git log`, never from what you remember of the last one. A compaction may
   have happened in between, and the files are the record that survives it.
2. **§5 snapshots and commits instead of waiting.** Write this phase's report
   rows (the block you would end with, as JSON, see `--report` in `SKILL.md`
   §5) and render:

   ```
   skitterspec spec-env review <spec> --run-reviewers --report <file> --phase <n> --snapshot
   ```

   **Do not arm the gate and do not wait.** Commit through `review.commitWith`
   (`/commit` by default), exactly as a `commit` verdict would, then record it:

   ```
   skitterspec spec-env run phase <spec> <n> --commit <sha>
   ```

   That puts `auto-commit` in the review history, so the record says the run
   committed this phase and no verdict did. Reviewer findings are recorded on
   the snapshot and never acted on.

Then go straight on to the next phase. Say nothing between phases beyond a
failure as it happens. The report is the block at the end.

## Stop conditions — the run hands back to a person

Stop **before building** a phase when any of these holds, and **after building**
when the tests stay red:

| Condition | Where it is seen |
|-----------|------------------|
| Tests red after `maxFixAttempts` fix attempts | §3, after each try |
| A `Blocked on:` line, or an unmet epic `Waits on:` | §3's `resume` and `epic check` |
| The phase has steps only a person can do | §3 *Manual steps* |
| A decision the spec left open, with more than one defensible answer | while building |

On a stop:

1. `skitterspec spec-env run stop <spec> --reason "<one clause>"`.
2. End exactly as a supervised phase would: the `⏸`/`❌`/`⚠️` block `SKILL.md`
   names for that case, then (where a page was rendered) arm the gate and wait.
   For a blocker or epic wait, nothing was built, so there is no page.
3. **The run stays active.** When the operator presses `Commit & Continue`, or
   types `/spec-next`, `run resolve` returns the run's own mode and ending
   (`modeFrom: "run"`), and the loop picks up where it stopped. `--supervised`
   on that command ends autonomy for the rest of the spec.

Never step past a stop condition to keep the run going. A run that guesses is
worse than one that waits.

## The ending — after the last phase

`run status --json` names the ending. Then:

- **`pause`.** Render the final page, arm the gate for the last phase, and wait
  exactly as `SKILL.md` §5 does:

  ```
  skitterspec spec-env review <spec> --final --run-reviewers
  ```

  It shows the whole branch, under one list of every phase's follow-ups and
  notes, the stops and compactions, with links to each snapshot and the run
  index. Its buttons are `Complete`, `Push branch`, `Open PR`,
  `Request changes` and `Discuss`. `/spec-diff` §2a routes them.
- **`push`.** `skitterspec spec-env integrate <spec> --push`, and run what it
  plans. The spec stays in flight.
- **`pr`.** Hand off to **`/spec-complete`**, whose PR-mode first run verifies
  every phase, pushes, and opens the PR. Its body lists each phase with its
  commit, from `run status --json`.

Then `skitterspec spec-env run end <spec> --outcome <ending>`, and write one
dated Changelog line on the spec: the phases built, the ending, and the
compaction summary when there is one.

## Notify

On the run's end, and on every stop, send a push notification where the
harness has one (Claude Code: `PushNotification`). Keep it to one line: the
spec, what happened, and what it is waiting for. A harness without one sends
nothing. The block, and the banner when waiting, follow as usual.

## Report

One block for the whole run, at its end or its stop. It is not one per phase,
because each phase's rows are already on its snapshot. Fields as `SKILL.md`
§6, plus:

- `Built` names the phases built in this run, each with its commit.
- `Notes` carries the compaction summary from `run status`, when there is
  one, and any stop's reason.
- `Review`, when not waiting, links the run index: the `local` URL with
  `/run` appended, and the same for every tier.
