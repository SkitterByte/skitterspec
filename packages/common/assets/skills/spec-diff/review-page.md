# The review page, verdicts and the gate

Applies only where isolation is configured. The banner and the wait are in
`review-wait.md`, beside this file.

## The page

`skitterspec spec-env review <spec> [--branch]` collects the worktree's changes
with `git -C` and writes a self-contained HTML page to
`.spec-env/reviews/<spec>.html` (gitignored). It has a file tree, whole-file
context that folds away, and new files included.
**The diff never passes through the model**, so rendering costs nothing. The written review (a short
read plus `flag`/`confirm`/`good` notes) is the part that costs tokens. It is
offered, never assumed. `/spec-diff` is gated on nothing: half a phase, a hand
edit or a colleague's branch are all fine.

## Taking a pass back

The reader ticks `✓ accept` per file, writes notes against a line or a file,
answers a written review's questions, and then **ends with a verdict**.
`/spec-diff` stores the pass (`--notes`) and routes on the verdict:

- `commit` / `commit-continue` (`Commit & Continue` commits, runs `/spec-next`,
  and **stops there**)
- `commit-start` (authoring pages only)
- `changes` means **work them now**.
- `discuss` means report and talk, changing nothing.
- `continue` appears on mid-run pages only.

**Two transports.** A **served** page POSTs to its own URL. The engine holds the
pass in a gitignored `.pending.json` and shows a **six-digit code**. A `file://`
page copies the pass to the clipboard and the reader pastes it. The code is an
address, never a password.

**Claiming.** Inside a wait the run started, `--claim-since` claims the one pass
that arrived in the window. It acts on none, and refuses when there are two.
Outside a wait, only `/spec-reviewed` (bare, or with a code) claims one.
**Claude never claims a pass it was not asked to.** A code that matches nothing
refuses, names nothing and never falls back to "the only one". Claiming
consumes the pass. A second pass from the same render supersedes the first.
`--drop <code>` disowns one. A claimed pass never enters the model's context:
the engine merges it and reports the counts.

**Resolutions.** Report what you did about each note with `--resolve`, and the
next render shows the note struck through with a one-line account. An accept is
keyed to the file's content hash, so it lapses on its own when the file changes
(shown as `accepted earlier — changed since`).
**The marks are information, never a gate**: nothing counts them.

## The verdict is chosen, never derived

The one refusal on the page:
**committing is unavailable while any comment is unresolved**. Unticked files block nothing. Both committing verdicts hand off to
the project's own commit skill (`review.commitWith`, `/commit` by default).
Skitterspec never vendors one. A verdict is **consumed**: a commit verdict by
the commit, a `changes` verdict by the work. Only a one-line outcome log
survives.

## The gate

A phase that ended owes an answer. `/spec-next` **arms** the gate when it
renders the end-of-phase page. Exactly two things clear it: a
**committing verdict**, or `skitterspec spec-env review skip "<reason>"` (typed as
`/spec-skip`). A bare skip with no reason is refused. While the gate is armed,
`/spec-next` refuses, and `.claude/hooks/review-gate.cjs` refuses `git commit`
**inside that spec's own worktree**. It hands the command line to
`spec-env review gate --check --for-command`. `skitterspec spec-env review gate
[--check] [--json]` is what both ask.

The gate fails **open** on every cannot-tell: no engine, an unreadable payload,
a crash, a timeout, `review.required: false`, or an unresolved spec. It is armed
**only when a phase ends**, never mid-phase, and it is on by default wherever
isolation is configured.

## A second opinion (`review.reviewers`)

CLI code reviewers (CodeRabbit's CLI, or anything printing rdjsonl) run once per
phase from `/spec-next` (`--run-reviewers`). `/spec-diff --reviewers` asks for a
run mid-phase, and a bare `/spec-diff` never spends one. Results are cached
against the diff's hash. Findings arrive as **checks**, badged with their tool.
**They never gate.** A reply to one is a comment, and comments do gate. A
reviewer that could not run shows `did not run — <why>` and never refuses
anything. The list is empty by default, because adding one sends the diff to a
third party. Never pass `--run-reviewers` on a `--docs` render.

## Put it live

`▶ Put it live` on the page commits the phase, checks the branch out where the
dev server can see it, and returns the same page. **It clears no gate.**
