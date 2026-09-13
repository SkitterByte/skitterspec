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
4. **The only spec provisioned in this repo** — ask the engine, with no spec
   named, from wherever you happen to be standing:

   ```
   skitterspec spec-env resolve
   ```

   Take its `spec:` line **only when it names exactly one spec**.

   This is the **durable** rung, and that is the whole reason it exists. Rungs 1
   to 3 all read *session* state, and session state does not survive a `/clear`,
   a new terminal tab, or coming back tomorrow — while the provisioned worktree
   they are each a proxy for is **on disk** and survives all three. `/spec-start`
   does leave the session standing in the worktree and that `cd` is real; what it
   is not is durable. Without this rung, a repo holding exactly one answer sends
   the operator away to re-supply something it already knew.

   It is also the resolution every other bare command in this workflow already
   uses — the worktree you are standing in, else the sole provisioned spec — so
   this rung is what stops `/spec-next` being a silent exception to a rule
   `.claude/rules/spec-planning.md` states has none left.

   **Say which spec you resolved and how**, before writing a line of it:
   *"not standing in a worktree — `<spec>` is the only spec provisioned"*. Rungs
   1 to 3 are self-evident to whoever typed the command; this one is not, and
   the operator cannot see from where they sit what you picked.

   **Several worktrees stay a refusal.** The engine names them and resolves
   nothing — exactly the ambiguity the refusal below exists for. Relay its list
   unchanged and stop; never pick from it.

   WHAT WOULD FOOL THIS: a worktree left behind by a declined teardown is still
   a worktree, so a finished spec can go on counting as provisioned. That widens
   the candidate set, so the failure it produces is an extra candidate — an
   ambiguity the engine refuses on — and never a wrong spec built. It cannot
   manufacture an *absence*, which is why the absence below is still worth
   refusing on.

**If none answers, refuse and stop:**
`no spec in flight — run /spec-start <name> to start one`.

That now answers a real absence — no worktree anywhere, the engine included —
rather than a session that merely lost track of where it was standing.

**Never fall back to the spec "in context".** A spec discussed in conversation
is not a spec in flight, and this skill writes real code: building the wrong
spec's phase produces commits on a branch nobody asked for. The refusal is
cheap; the mistake is not.

**Rung 4 is not that fallback wearing a hat.** A provisioned worktree is a
record that someone ran `/spec-start`: it is on disk, the engine reads it, and it
either names one spec or refuses. A spec named in conversation is a guess about
intent with nothing underneath it, and no number of them ever resolves to one.

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

**The offer is the `Review` row of step 6's block** — the counts, the page link
and a question, in one row:

| **Review** | <N> files, +<a> −<d> · [open the page](<the `open:` URL>) — want a written review before you commit? |

**It ends in a question, addressed to someone.** It was once a fenced block of
engine output, and it fired on every phase and was never once taken: two quoted
lines under the test counts, addressed to nobody, with the report then closing
on *"commit this first"* — the last instruction the reader got was to move on,
so they did. A row in a labelled table is findable; a question in it is
answerable. Both halves are load-bearing.

**Never bury it and never split it.** It sits above `Follow-ups` and `Next`, and
the page and the question stay in the same row: two adjacent rows about one page
make the reader resolve a distinction before acting on either. A later edit that
moves it out of the block, or separates the link from the question, undoes this
and should be read as a regression rather than tidying.

**Non-blocking, deliberately.** Do not end your turn waiting on the answer.
Phases get chained — `/commit && /spec-next` typed as one line — and a question
that stops the run taxes every phase to fix a problem the row already fixes.

Relay the **`open:`** line the engine prints, not the bare path: a path is not
clickable in any terminal, and a page nobody can open is a page nobody reads.

- **Never write the review unasked**, and **never publish**. Publishing leaves
  something behind that this tooling cannot remove, so it is always something
  someone asks for. A `file://` link is no use on a phone, and saying so **is**
  the ask — publishing is the answer to it, and `/spec-diff` §6 owns how.
**Follow the `reader:` line the engine printed — do not sniff for it.** It
answers where the person reading this is sitting, and the offer changes with it:

- **absent** (`unknown`) — the `file://` URL, exactly as always. **Do not warn:**
  unknown is the ordinary state of a local machine, and a warning there is an
  accusation against a healthy session.
- **`local`** — the `file://` URL.
- **`remote`** — the engine has already stood its local server up and put a URL
  the reader can open on `open:`. So there is **nothing special to say**: relay
  that line like any other. Any `also:` lines under it are the other addresses
  this machine has, offered because the best-guess one can be wrong — pass them
  on rather than editing them out.

**Never read an environment variable to decide this** — not `SSH_CONNECTION`,
not `CLAUDE_CODE_*`, not a tty check. The engine did it, reports it on that line
and in `--json`, and a second implementation here could not be tested and would
drift.

**Serving is the engine's to do; publishing is never.** A `remote` reader
authorises a local server — one process, ended by one flag, leaving nothing
behind — and authorises nothing else. Publishing leaves a page this tooling
cannot remove, so it stays an ask in every case, always. If the engine could not
serve (a busy port, a machine with no network address) it falls back to the
`file://` URL with its marker, and that is when publishing is worth naming.

- **Never fatal.** A failed render — no worktree, a git error — is one line and
  the phase is still done. The page is a convenience; the repo is the record.
- If the project has no isolation config, skip the whole step in silence rather
  than explaining an absence.

## 6. Report

Do **not** `git commit` unless the user asks — finish, verify, and wait.

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the phase is built and its tests are green.
- `⚠️` — built and green, with something worth knowing (a mirror that did not
  refresh, a deviation from the plan).
- `❌` — the phase's tests are red, or it stopped part-way. Quote the failure.
- `⏸` — no spec in flight, or the name given does not match the one that is.

**Fields:** `Tracker` · `Branch` · `Built` · `Tests` · `Review` ·
`Follow-ups` · `Next`

`Next` names the phase, as `/spec-next → phase 3 (Auth)`, so the block says
which phase is next without a line of prose for it.

**Step 5's offer is the `Review` row.** It is not a paragraph after the block,
because nothing is after the block: the counts, the page link and the question
go in one row, above `Follow-ups` and `Next`. Step 5 renders before the commit
and this step is where its offer lands, so the two must not disagree about where
it goes.
