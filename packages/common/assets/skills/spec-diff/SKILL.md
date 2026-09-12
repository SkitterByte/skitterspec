---
name: spec-diff
description: See what a spec's worktree changed — render its diff as a page you can mark up, take that review pass back, and act on it. Answers at any point, including half-way through a phase. Use when the user says "/spec-diff", "show me the diff", "what did this phase change", "review this spec's work", wants to read a worktree's changes away from the terminal, or pastes back the JSON the review page's Copy button produced.
---

# /spec-diff — see the phase before you commit it

A phase is built in its own worktree, and the terminal is somewhere else — so
`git diff` answers about the wrong branch and a 350-line diff read as terminal
text is scrolling, not review. This renders the diff as a page instead: the
engine collects it with `git -C`, writes a self-contained HTML file, and you open
it locally or publish it and read it on a phone.

**The diff never passes through the model.** git writes the patches and the
engine splices them into the page. A 266KB patch costs **zero** context tokens,
and a 289KB page costs the same to publish as a 5KB one. Do not "simplify" this
by reading the diff and emitting HTML — that is the one change that would undo
the whole design.

## 1. Resolve the spec — three rules, in order

1. **The name argument**, when given. An unknown name **refuses** and says so:
   falling back would review a different spec's work under the name you typed,
   which looks exactly like a correct answer.
2. **The spec in flight for this session** — `skitterspec spec-env live status`
   names the spec whose branch is checked out in the primary checkout.
3. **The worktree this session is standing in** — if cwd is inside a spec's
   worktree, that is the spec.

If none answers and several specs have worktrees, **list them and stop**. The
engine does this for you: run the verb with no name and it either resolves the
sole candidate or prints the candidates.

## 2. Were you handed a review pass? Then that is the job

The page has marks on it — `✓ accept` per file, notes against a line or a whole
file, answers to the checks a written review asked — and one **Copy review**
button that puts them on the clipboard as JSON. When that JSON is pasted to you,
**this is not a request to render anything**: it is a review coming back, and
these steps replace §3–§5 below.

1. **Store it through the engine.** Write the pasted JSON to a scratch file
   verbatim — never retype it, never "tidy" it — and merge it:

   ```
   skitterspec spec-env review <spec> --notes <file>
   ```

   It validates wholesale and refuses without writing anything if the blob is
   malformed or names a different spec. **Relay a refusal as it is written** and
   stop; every message says which entry was wrong, so there is nothing to guess.

2. **Say what you read, then stop.** Report the accepted count, then each open
   comment as `file:line — note`, then the files you would touch. **Wait.**
   Pasting is not a go-ahead: this skill is read-only everywhere else, a misread
   comment costs a revert, and the operator may only have wanted it recorded.

3. **On the go-ahead, work only the commented files.** Read those; do **not**
   open the accepted ones. That is the whole saving the marks buy, and it is
   only worth anything if it is true — so say plainly which files you did not
   open. Make the changes, then run the project's typecheck and test commands.

4. **Write back what you did**, one entry per comment you acted on:

   ```json
   [{ "id": "2026-01-01T00:00:00.000Z-1", "note": "keyed the accept on the blob sha" }]
   ```

   ```
   skitterspec spec-env review <spec> --resolve <file>
   ```

   The note is the load-bearing half: it is what lets the next read **verify**
   the fix rather than trust it. An id that matches nothing is reported and
   skipped, so one bad id never costs you the rest. Then re-render (§3) so the
   page shows each note struck through with its account.

**A mark is information, never a gate.** Nothing counts the ticks or requires
them: a phase may end with comments open, `/spec-complete` never learns about
them, and this skill refuses nothing on their account. If a project ever wants
otherwise that is a config key defaulting to off — not a tidy-up here.

**What the intake costs.** The blob is file paths and the operator's own words,
which you need in context to act on them — so the paste is not overhead. The
*work* it authorises is ordinary phase-sized cost, and step 2 is where they get
to decide whether to spend it.

## 3. Gate it on nothing

**This skill has no preconditions and must never grow one.** Not tests passing,
not the phase being finished, not the spec being this session's, not a clean
tree. Reviewing work in progress is the *common* case — half a phase, a hand
edit, a colleague's branch — and a gate would refuse at exactly the moment
someone wants to look.

If a later edit is tempted to add "only when the phase is complete", the answer
is no. The page is free to produce and changes nothing. The same goes for the
marks: a spec with unread files or open comments is an ordinary spec, and
nothing here may start counting them.

## 4. Render the page

```
skitterspec spec-env review <spec>              # uncommitted work (the default)
skitterspec spec-env review <spec> --branch     # everything since the base branch
```

Default to the working tree — "what did this phase just do". Use `--branch` when
the question is about the whole spec.

**You do not have to reach for `--branch` after a commit.** A clean working tree
is the state a phase *ends* in, so the engine falls back to the branch range by
itself and says which it is showing — `(working tree clean — since main)` in the
header line, and `(working tree clean)` on the page. Report that wording as it
came rather than calling it the working tree.

The fallback fires on exactly one state — no `--branch`, and nothing uncommitted
to show. An explicit `--branch` always means what it says, a tree with real
changes is never swapped out from under you, and a branch with no work at all
still reports `nothing to review` exactly as before.

Add `--json` to get the file list, totals and the page path back as data. The
page is written to `.spec-env/reviews/<spec>.html`, which is gitignored — it
leaves no trace in the branch under review.

**On `--page-only`, stop here** and report the path.

## 5. Offer the written review — say what it costs first

The page is free. The **written review is not**, and it costs in two separate
ways. Quote the one that actually applies rather than a single number:

- **Writing it: ~700 output tokens.** The review JSON, near enough regardless of
  how big the diff is. This is unavoidable and it is what was measured.
- **Reading the diff: input, and it scales.** Only paid when the diff is not
  already in front of you. A 350-line diff is easily 10–15k input tokens.

**If you just built this phase, you already have the diff — do not re-read it.**
That is the common case (`/spec-next` offers this skill the moment a phase ends)
and the one the ~700 was measured in. Running `git diff` over code you wrote
three tool calls ago buys nothing and is not free.

**When you genuinely do not have it** — a fresh session, half a phase from
yesterday, a colleague's branch — read *selectively*. `--json` returns the file
list with each file's `+`/`−`, `status` and `noise` flag and **no patches**, so
use it to choose: skip everything marked `noise: true`, and skip files the review
will not have anything to say about. Pulling the whole diff in when three files
matter is the avoidable half of this cost.

Say what it will cost, then let the operator decide. Do not write it unasked when
the diff is large.

When asked, write JSON to a scratch file:

```json
{
  "summary": "Two or three sentences on what this phase actually did, read from the diff.",
  "checks": [
    { "level": "flag",    "file": "src/env/review.js", "note": "…" },
    { "level": "confirm", "file": "test/env-review.test.js", "note": "…" },
    { "level": "good",    "file": "src/cli.js", "note": "…" }
  ]
}
```

- **`flag`** — something you believe is wrong. **`confirm`** — something only the
  author can settle. **`good`** — a decision worth keeping, said once.
- Every check names the file it is about.
- **Review the diff, not the spec.** Keep to what the change shows; do not
  re-derive the plan or restate the spec's reasoning back at its author.

Then re-render with it spliced in — the engine renders it, you never emit HTML:

```
skitterspec spec-env review <spec> --review <file>
```

## 6. Publish only when asked

**Never publish unprompted.** Publishing leaves something behind that this
tooling cannot remove, and the page already works as a local file. Offer it;
do not assume it.

When the user asks:

- **One spec is one page.** `--json` reports `url` when this spec has been
  published before. If it has, **update that URL** rather than creating a
  second entry, and label the new version for the phase (`phase-3`).
- **On the first publish**, write the returned URL to the path `--json` reports
  as `urlFile` — one line, no formatting. That file is how every later phase
  finds the same page. Never construct the path yourself.
- **Degrade in one line.** If the harness cannot publish — no capability, an
  error — say so, report the local file path, and carry on. That is a working
  outcome, not a failure.

The engine knows nothing about publishing and cannot do it. It writes a file and
reads a URL back as an opaque string; everything about what that string means
lives here.

## 7. Report

Say what changed (files, `+`/`−`), where the page is, and — if published — the
URL. When the page carries a review pass, say that too: how many files are
accepted, how many comments are open, and how many have been answered. `--json`
reports all three under `notes.totals` — read that, never the diff. If the spec has no worktree, say that plainly and stop: a spec that has not
been started has nothing to diff, which is an ordinary state and not an error.
