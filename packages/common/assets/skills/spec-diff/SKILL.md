---
name: spec-diff
description: See what a spec's worktree changed — render its diff as a self-contained HTML page, optionally add a written review, and publish it only when asked so it can be read on a phone. Answers at any point, including half-way through a phase. Use when the user says "/spec-diff", "show me the diff", "what did this phase change", "review this spec's work", or wants to read a worktree's changes away from the terminal.
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

## 2. Gate it on nothing

**This skill has no preconditions and must never grow one.** Not tests passing,
not the phase being finished, not the spec being this session's, not a clean
tree. Reviewing work in progress is the *common* case — half a phase, a hand
edit, a colleague's branch — and a gate would refuse at exactly the moment
someone wants to look.

If a later edit is tempted to add "only when the phase is complete", the answer
is no. The page is free to produce and changes nothing.

## 3. Render the page

```
skitterspec spec-env review <spec>              # uncommitted work (the default)
skitterspec spec-env review <spec> --branch     # everything since the base branch
```

Default to the working tree — "what did this phase just do". Use `--branch` when
the question is about the whole spec, or when the phase is already committed.

Add `--json` to get the file list, totals and the page path back as data. The
page is written to `.spec-env/reviews/<spec>.html`, which is gitignored — it
leaves no trace in the branch under review.

**On `--page-only`, stop here** and report the path.

## 4. Offer the written review — say what it costs first

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

## 5. Publish only when asked

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

## 6. Report

Say what changed (files, `+`/`−`), where the page is, and — if published — the
URL. If the spec has no worktree, say that plainly and stop: a spec that has not
been started has nothing to diff, which is an ordinary state and not an error.
