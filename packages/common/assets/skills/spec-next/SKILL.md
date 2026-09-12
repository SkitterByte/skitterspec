---
name: spec-next
description: Build the next unfinished phase of the spec in flight for this session — pre-flight, implement with tests, record progress and refresh the tracker. Refuses when no spec is in flight rather than guessing one, and builds one elsewhere only when handed its worktree path. Use when the user says "/spec-next", "build the next phase", "continue the spec", or "carry on with this spec".
---

# /spec-next — build the next phase of the spec in flight

It assumes the workbench is already set up: a spec is **in flight** on this
checkout, and this skill implements its next unfinished phase. Putting a spec in
flight — provisioning, moving it to `in-progress`, getting its branch here — is
`/spec-start`'s job. Re-run this per phase until the spec is done, then
`/spec-complete`.

## 1. Identify the spec in flight

**`--worktree <path>` answers before anything else.** When the invocation names a
worktree, that is the spec to build and that is where it is built — cwd is not
consulted. It is how `/spec-start` carries on into phase 1 without moving your
session, and you can type it yourself.

**This is not a loosening of the refusal below.** That refusal exists against
*guessing* which spec to build, and a path someone typed is not a guess. A bare
`/spec-next` still refuses exactly as it does today.

**Validate the path before writing a line into it.** Run the resolver *from* the
path, so the answer comes from where you are about to write:

```
cd "<path>" && skitterspec spec-env resolve
```

Check the `worktree:` line it prints is that same path. If it is not — or the
command reports that isolation is not enabled — refuse and stop, naming what you
were given. A path that is not a provisioned worktree must never become a place
to write code.
**Read the output, not the exit status** — it exits 0 even when it
cannot resolve anything.

**Not `--dir <path>`.** That flag sets the **repo root**, not the worktree to
resolve from, so it answers a different question: on a repo with two or more
worktrees it refuses with *"no spec given, and N specs have worktrees"* and
validates nothing at all. The `cd` form is what makes the path itself the
evidence.

Otherwise resolve **in this order**, and stop at the first that answers:

1. **The live spec of this checkout** — run
   `skitterspec spec-env live status` and read its `live:` line. `live: yes`
   names the spec whose branch is checked out here; that is the one to build.
2. **The worktree you are standing in** — if this session's cwd is inside a
   spec's worktree, that spec is in flight *for this session*. This is the
   manual-parallel path: several specs may be provisioned, and a terminal tab
   opened in one is its own workbench.
3. **The current branch, in `checkout` mode** — no worktrees exist, so the
   branch the checkout is on names the spec.

**If none answers, refuse and stop:**
`no spec in flight — run /spec-start <name> to start one`.

**Never fall back to the spec "in context".** A spec discussed in conversation
is not a spec in flight, and this skill writes real code: building the wrong
spec's phase produces commits on a branch nobody asked for. The refusal is
cheap; the mistake is not.

A **name argument** is accepted, but it must *match* the spec in flight — it
narrows a re-run, it does not select a different spec. A mismatch refuses,
naming both.

## 2. Pre-flight — commit prior work

Before writing any code for this phase, get the workspace clean:

- **Confirm the last-worked phase is committed.** Run `git status` and
  `git log --oneline -5`. The most recently *implemented* phase (not necessarily
  the numerically previous one) should already be committed. If prior-phase work
  is still uncommitted, **stop and suggest committing it first** (e.g. via
  `/commit`) so each phase lands as its own reviewable commit — don't build the
  next phase on top of an uncommitted one. (Skip if this is the first phase —
  there's nothing prior to commit.)

## 3. Implement the phase

Identify the **first unfinished phase** from the `00-overview.md` phase index,
then open its phase file (`0N-<slug>.md`) — that file holds the tasks. Mark it
started: set the phase-file heading to `🔄` and its `> **Status:**` to
`In progress`, and flip the matching row in the overview phase index to `🔄`.

**Then sync with the tracker (only if a provider is installed).** The phase has
just changed state, so refresh the mirror before the build starts — that is what
makes the phase show as in progress *while* it is being built rather than only
once it is over. Without a provider this is a no-op and nothing below changes.

<!-- seam:spec-next-start -->

**On the `--worktree` path, record the baseline before you write anything:**

```
skitterspec spec-env resolve <spec> --record-primary
```

Then build as below, with one discipline on top.
**The session is not standing in the worktree**, so every write takes an
absolute path under it and every command
is prefixed `cd "<worktreePath>" &&` — typecheck and tests included. A single
relative path lands the work in the primary checkout, on the base branch, and
nothing about it looks wrong at the time. Step 4b is what catches it.

Then build it, following the project rules in `.claude/rules/*.md` and `CLAUDE.md`:

- Work task by task through the phase file. Make focused edits that match
  surrounding code.
- Honour the project's conventions (see `.claude/rules/spec-planning.md` and the
  rules it links).
- **Tests are part of the phase, not after it.** Create/extend tests for the
  work, then run the project's typecheck and test commands. Do not declare the
  phase done until green.
- Never hardcode dates in tests; never run destructive commands against a real
  database — use the project's test database only.

## 4. Record progress

- In the **phase file**: tick completed tasks (`- [x]`), flip its heading to `✅`,
  and set its `> **Status:**` to `Done`.
- In **`00-overview.md`**: flip the matching phase-index row to `✅`.
- If anything changed from the plan (a decision, a deviation, a discovered
  constraint), add a dated **Changelog** entry in `00-overview.md`.
- If new work surfaced, add it as tasks to the appropriate phase file (or add a
  new phase file + index row) rather than doing it silently.

**Then refresh the mirror (only if a provider is installed).** The phase is done
in the repo now; leaving the tracker to catch up at `/spec-complete` is what makes
a mirror lag a whole spec behind. Without a provider this is a no-op.

<!-- seam:spec-tracker-progress -->

## 4b. On the `--worktree` path, prove nothing leaked

**Only when this run was given `--worktree`.** Standing in the worktree, this
step does not apply and there is nothing to check.

The phase is built and its progress recorded — all of it written into a tree this
session is not standing in. Before reporting any of it as done:

```
skitterspec spec-env resolve <spec> --assert-primary-clean
```

- **Exit 0, "primary checkout clean"** — carry on.
- **Non-zero** — stop and relay the engine's message unchanged. It names the
  paths and both readings: this build wrote them and they belong in the worktree,
  or something else did and the baseline wants re-recording.
  **Do not guess which, and do not delete anything.**
  A path that appeared is not proof of who put it there.
- **"cannot tell"** — no baseline, or one from another spec. It exits 0 and
  claims nothing; say so in one line and carry on. An absence is not evidence.

## 5. Render the page — then offer the review, never write it

**Only when the project has per-spec isolation** (`specs/.core/env.config.json`
present). Without it there is no worktree to read and this step does not exist.

The phase is built, its tests are green, and nothing is committed yet. That is
the moment the page is about, so render it now — **after** the tests pass and
**before** the commit:

```
skitterspec spec-env review <spec>
```

**This is free.** It is the engine reading git and splicing text into a template;
the diff never passes through you, so a 266KB patch costs nothing. Report the
path it prints and move on.

**Then offer `/spec-diff`. Do not run it.** The written review is the part that
costs — roughly **700 output tokens**, because writing it means reading the diff
— and that spend is the operator's call, not a default.

**Write it as prose ending in a question, and put it LAST** — after the
`Next: phase N` line of step 6, as the final thing in the report:

```
Page is rendered: <the `open:` file:// URL it printed> — <N> files, +<a> −<d>.

Want a written review of it before you commit?
```

**A fenced block of engine output is not an offer.** It was one once, and the
result was an offer that fired on every phase and was never once taken: two
quoted lines in the tail of a long report, under the test counts, with the
report then closing on *"commit this first"*. Nothing in it was addressed to
anyone, and the last instruction the reader got was to move on — so they did.
Ask them something, and ask it where the message ends.

**Never bury it and never reorder it back.** The offer is last because being
last is the whole fix; a later edit that tucks it under the test results, or
ahead of the next-phase line, undoes this phase and should be read as a
regression rather than tidying.

**Non-blocking, deliberately.** Do not end your turn waiting on the answer.
Phases get chained — `/commit && /spec-next` typed as one line — and a question
that stops the run taxes every phase to fix a problem that being last already
fixes.

Relay the **`open:`** line the engine prints, not the bare path: a path is not
clickable in any terminal, and a page nobody can open is a page nobody reads.

- **Never write the review unasked**, and **never publish**. Publishing leaves
  something behind that this tooling cannot remove, so it is always something
  someone asks for. A `file://` link is no use on a phone, and saying so **is**
  the ask — publishing is the answer to it, and `/spec-diff` §6 owns how.
- **Never fatal.** A failed render — no worktree, a git error — is one line and
  the phase is still done. The page is a convenience; the repo is the record.
- If the project has no isolation config, skip the whole step in silence rather
  than explaining an absence.

## 6. Report

Summarise what was implemented, the test result (quote failures if any), and
which phase is next. Do **not** `git commit` unless the user asks — finish,
verify, and wait.

**Then step 5's offer, and nothing after it.** The order is fixed: what was
built, the test result, `Next: phase N`, then the page and the question. Step 5
renders before the commit and this step is where its offer lands, so the two
must not disagree about the position — the offer is the last thing on screen or
it is not an offer.
