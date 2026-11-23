---
name: spec-resume
description: Go back into a spec that is already in flight, by its name or its ticket (#N), without starting anything. Rebuilds its worktree when this machine has none, moves the session there, shows what it is blocked on, then acts on the message given with it — feedback on shipped work, "the deploy is out", a question. Use when the user says "/spec-resume", "back to <spec>", "pick up #N again", or reports on a spec that is already in progress.
---

# /spec-resume — back into a spec in flight

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

Some specs wait on things outside the repo: a deploy, another project's
release, a phase that has to run in prod for a week. This skill is how you come
back to one. **It is not a start.** It moves no bucket, assigns nobody, touches
no tracker status and builds nothing itself. `/spec-start` puts a spec in
flight, and `/spec-next` builds a phase. This skill puts you back where the
spec is, then does what the message asks.

The argument is `<name|#N> [message]`. The first word is the spec, and
everything after it, a leading `-` or `—` dropped, is the message.

## 1. Ask the engine

```
skitterspec spec-env resume <name|#N> --json
```

It reads every copy of the spec it can see: this checkout, each worktree, and
each spec branch, local then remote-tracking, never fetched. That matters
because the base branch reads `backlog` for the whole life of a spec, and under
`land.specDocs: "branch"` an in-flight spec may exist only on its branch.

- **`ok: false` with an `offer`.** That is a completed spec, and the offer is
  re-opening it. Relay the `refused` text, **then** put the offer's `label`
  and Cancel to the operator as `.claude/rules/offered-unblocks.md`
  describes: the label verbatim, nothing pre-selected, and no third option.
  On the label, go to **1b**. On Cancel, stop with `⏸` and record nothing.
- **`ok: false` and no `offer`.** Relay the `refused` text and stop with
  `⏸`. It covers a name or ticket that matches nothing (it never guesses the
  nearest), a spec in `backlog` (`Next` is `/spec-start <name>`), a cancelled
  spec, a completed hotfix or epic, and one with no branch anywhere to resume
  from. **Never offer a re-open the engine did not declare**, however
  obviously one seems to fit.
- **`ok: true`.** Carry on. `blockers`, `progress` and `identifier` are read
  in step 3.

## 1b. Re-open a completed spec (only on the offer's pick)

Sometimes a spec was completed to get its work onto the base branch, and more
phases turn out to be needed. Its branch went at teardown, and its work is on
the base, so re-opening is a fresh branch **at the base as it is now**. This
step does what `/spec-start` does for that branch, and nothing more.

1. **Ask for the plan.** Run
   `skitterspec spec-env resume <spec> --reopen --json`. A refusal here
   (a worktree still standing, or a leftover branch holding commits the base
   does not have) is relayed and ends `⏸`. It never resets work, and neither
   do you.
2. **Provision.** Bring the review server up as step 2 says. Run the plan's
   `commands` in order from the primary checkout. The first creates the
   branch at the base, and the second is `spec-env up`, a planner: run the
   commands it prints, then its `then` line with the `cd` in front, exactly
   as `/spec-start` step 3 does. Confirm with `skitterspec spec-env resolve`
   (no argument) as step 2 below does.
3. **Move it back, and say why.** Run the plan's `move` command. Add a dated
   Changelog line, `Re-opened from complete: <reason>`. The reason comes from
   the message, or is **asked once** when there is none.

<!-- seam:spec-status-owner -->

   - Set the **Status** header: `> **Status:** In Progress — re-opened <YYYY-MM-DD>`.
   - Append a **State log** row: `| <YYYY-MM-DD> | In Progress | in-progress | <git user.name> |`.

4. **Put the ticket back in progress.** The bucket move is the same code fact
   `/spec-start` reports, so it takes the same steps. On a re-open, the board
   reporting the ticket Done or Cancelled is **expected rather than a warning**:
   the push below is what moves it back. Do not relay it.

<!-- seam:spec-tracker-assign -->

<!-- seam:spec-tracker-start -->

5. **Commit it** before anything is built: `skitterspec spec-env stage <spec>`
   and its `owned` paths, pathspec-bounded on both the `add` and the
   `commit`, as `docs(spec): reopen <spec>` with the `Refs:` trailer when
   there is a ticket.

Then carry on at **step 3**. Every phase reads `✅`, so step 4's rule for new
work applies: the message becomes a new phase file plus an index row. With no
message, **ask what the new phase is** rather than inventing one.

## 2. Get into its worktree

**Only when the project has per-spec isolation** (`specs/.core/env.config.json`).
Without it there is no worktree, so you are already where the spec is. Skip to
step 3.

**Bring the review server up first, from the primary checkout**, exactly as
`/spec-start` §2b does: `skitterspec spec-env review serve --host 0.0.0.0`.
Say nothing when it is already up. If it can't start, say so in one line and
carry on.

**When `commands` is non-empty, this machine has no worktree for the spec.**
That is the expected path, not an edge case: a spec parked on another machine,
or pruned while it waited. Run the `commands` as printed, then the `then`
commands, with the `cd` in front, as `/spec-start` step 3 does:

```
cd "<worktree.path>" && skitterspec spec-env bootstrap <spec>
```

The commands attach the spec's own branch, local or tracked from the remote.
**Never add a `-b` of your own.** A fresh fork would hand back an empty tree with
the work out of reach, and the engine refused that case already.

**When `commands` is empty, the worktree is there.** `cd` into `worktree.path`
unless the session is already standing in it.

**Then confirm the move landed.** `skitterspec spec-env resolve` with no
argument must name this spec, the same positive signal `/spec-start` asks for.
If it names anything else, stop with `❌`, print the path, and write nothing.

## 3. Show where it stands

Before acting on the message, read the spec's `00-overview.md` and the phase
file for `progress.current` (else the first unfinished one). Then put any
`blockers` in front of the reader, one per line, with the `until` date where it
has one. A blocker is the most important thing a resumed spec can say: it is
why the spec stopped.

## 4. Act on the message

**No message: report and stop.** `Next` is `/spec-next` (or the blocker, if
one stands in its way).

**With a message, read it against the spec and decide what it is asking.**
This is judgment, not a template. A message is usually one of these, and can
be several:

- **A blocker's condition is met.** For example: "LSC is released", "it has
  been live a week". Where the message plainly says so, remove that
  `> **Blocked on:**` line and add a dated Changelog line naming what cleared
  it. Where you cannot tell whether it is met, **ask once**: "this was blocked
  on `<text>`, is that done?". Never clear a blocker in silence.
- **A question about the spec.** For example: "now LSC is out, what do we need
  to test?". Answer it from the spec's own phases, tasks and Decisions, and
  quote the tasks rather than paraphrasing them. Write nothing.
- **Feedback on the work this spec shipped.** For example: "the toast says why,
  but the record stays on screen and delete does nothing". Turn it into tasks:
  add them to the current `🔄` phase, or, when every phase is `✅`, to a new
  phase file plus an index row (`/spec-next` §4's rule for new work). Add a
  dated Changelog line quoting the report.
- **Work outside this spec.** For example: a different feature, or a defect in
  code the spec never touched. Propose the right door with a one-line reason,
  confirm first, as `.claude/skills/spec/kind-routing.md` does. A
  defect goes to `/spec-bug`; new behaviour goes to `/spec`. On a no, carry
  on with whatever part of the message was this spec's.

**Commit what you wrote to the spec before building anything.** Use
`skitterspec spec-env stage <spec>` and its `owned` paths, pathspec-bounded on
both the `add` and the `commit`, as `docs(spec): resume <spec> — <what changed>`
with the `Refs:` trailer when there is a ticket. `/spec-next` §2 refuses to
build on an uncommitted tree, and these edits are the spec's own documents, not
a phase's work.

**Then build, if the message asked for work.** Hand off to a bare
**`/spec-next`**: it resolves this spec from the worktree you are standing in,
honours the review gate, builds the first unfinished phase (which now holds the
new tasks), and ends on its own review page. That is the only way this skill
writes code. A gate that `/spec-next` refuses on is relayed as it says. It is
never stepped past.

**Where the message cleared a blocker and asked for nothing more**, do not
build on that alone. Offer it instead: "build phase N now?", recommending yes,
the same question `/spec-start` step 6 asks. A blocker clearing is a reason the
work can go on, not an instruction to do it now.

## 5. Report

**When step 4 handed off to `/spec-next`, emit no block here.** That skill
ends with its own block, and two blocks for one run is the noise the contract
exists to remove.

Otherwise, end with the block defined in `.claude/rules/spec-reports.md`.

**Verdicts**

- `✅`: the session is standing in the spec's worktree and the message, if
  any, was answered.
- `⚠️`: resumed, with something worth knowing. For example, a blocker still
  stands, or bootstrap failed a step that does not stop the reading.
- `❌`: provisioning or the move failed part-way. Name what was left and
  where.
- `⏸`: the engine refused, or a re-open offer was answered Cancel. Nothing
  was provisioned and nothing moved.

**Fields:** `Tracker` · `Spec` · `Built` · `Notes` · `Worktree` ·
`Follow-ups` · `Next`

`Spec` is the bucket and progress (`2 of 4 done, phase 3 in progress`), and
says **re-opened from complete** after 1b. `Worktree` is the path, and says
**entered**, **provisioned** or **re-opened**. `Built` lists
what the message added to the spec (tasks, a cleared blocker), and is absent
when nothing was written. `Notes` carries any blocker still standing, quoted.
`Next` is `/spec-next` when the spec is ready to build, or the blocker when one
stands in the way.
