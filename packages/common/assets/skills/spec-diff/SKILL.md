---
name: spec-diff
description: See what a spec's worktree changed — render its diff as a page you can mark up, take that review pass back, and act on it. Answers at any point, including half-way through a phase. Use when the user says "/spec-diff", "show me the diff", "what did this phase change", "review this spec's work", wants to read a worktree's changes away from the terminal, or pastes back the JSON the review page produced — approve, request changes or discuss.
---

# /spec-diff — see the phase before you commit it

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

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
file, answers to the checks a written review asked — and it
**ends in a decision**: `✓ Approve`, `↺ Request changes` or `… Discuss first`,
each copying the pass to the clipboard as JSON with its verdict already set. When that
JSON is pasted to you, **this is not a request to render anything**: it is a
review coming back, and these steps replace §3–§5 below.

1. **Store it through the engine.** Write the pasted JSON to a scratch file
   verbatim — never retype it, never "tidy" it — and merge it:

   ```
   skitterspec spec-env review <spec> --notes <file>
   ```

   It validates wholesale and refuses without writing anything if the blob is
   malformed or names a different spec. **Relay a refusal as it is written** and
   stop; every message says which entry was wrong, so there is nothing to guess.

2. **Read the verdict the engine judged.** The pass says what it CONCLUDED, and
   the engine prints it — `approved`, `changes requested`, `discuss first`, or
   `approve refused — <reason>`. It is judged, not taken on trust: an approval
   arriving with an open comment is refused and routed to discuss, because you
   asked for something and it therefore cannot also be fine.
   **Never re-judge it yourself, and never count anything** — read the engine's
   answer and route on it.

   Three routes, and every pass takes exactly one:

   | Verdict | What it means | Where to go |
   |---------|---------------|-------------|
   | `approve` (honoured) | this is fine, land it | §2a — commit it |
   | `changes` | do these, now | step 4 — **skip the wait**, this is the go-ahead |
   | `discuss` | report it and talk | step 3 — report, then wait |

   **A refused approval and a pass with no verdict both mean `discuss`.**
   Neither is a special case: the engine routes the refusal there itself, and an
   absent verdict has always meant "report it and wait" — which is why that is
   what it still means.

3. **Say what you read, then stop.** Report the accepted count, then each open
   comment as `file:line — note`, then the files you would touch.
   **Wait — unless the verdict already said otherwise.** Pasting on its own is
   not a go-ahead: this skill is read-only everywhere else, a misread comment
   costs a revert, and the operator may only have wanted it recorded. A `changes`
   verdict **is** that go-ahead, given deliberately on the page, so asking again
   is asking someone to decide twice. The reasoning is unchanged; what changed is
   that the page can now answer it in advance.

4. **On the go-ahead, work only the commented files.** Read those; do **not**
   open the accepted ones. That is the whole saving the marks buy, and it is
   only worth anything if it is true — so say plainly which files you did not
   open. Make the changes, then run the project's typecheck and test commands.

   **First, compare the worktree against where you are standing.** This is the
   one step here that writes, and §1's first rule resolves by **name** — so
   editing a tree this session is not standing in is the ordinary case, not an
   edge one. Take the `worktree:` line from
   `skitterspec spec-env resolve <spec>` and compare it with cwd, resolving both
   paths first so a symlinked or trailing-slash spelling of one tree does not
   read as two. Same tree, and everything below is inert.

   **Different trees, and the discipline applies.** Record the baseline before
   the first edit:

   ```
   skitterspec spec-env resolve <spec> --record-primary
   ```

   Then every write takes an absolute path under the worktree and every command
   is prefixed `cd "<worktreePath>" &&` — typecheck and tests included. A single
   relative path lands the fix in the primary checkout, on the base branch, and
   nothing about it looks wrong at the time.

   **This is a write discipline, not a precondition.** It changes *how* this
   step writes, never *whether* it runs — §3 below still holds in full, and a
   later edit reading this as a gate would undo the rule it exists beside.

5. **Write back what you did**, one entry per comment you acted on:

   ```json
   [{ "id": "2026-01-01T00:00:00.000Z-1", "note": "keyed the accept on the blob sha" }]
   ```

   ```
   skitterspec spec-env review <spec> --resolve <file>
   ```

   The note is the load-bearing half: it is what lets the next read **verify**
   the fix rather than trust it. An id that matches nothing is reported and
   skipped, so one bad id never costs you the rest. Then re-render (§4) so the
   page shows each note struck through with its account.

6. **Before the re-render, prove nothing leaked** — only when step 4 found two
   trees. Nothing should be reported fixed before it is known to be fixed in the
   right one:

   ```
   skitterspec spec-env resolve <spec> --assert-primary-clean
   ```

   - **Exit 0, "primary checkout clean"** — carry on.
   - **Non-zero** — stop and relay the engine's message unchanged. It names the
     paths and both readings: this run wrote them and they belong in the
     worktree, or something else did and the baseline wants re-recording.
     **Do not guess which, and do not delete anything.** A path that appeared is
     not proof of who put it there.
   - **"cannot tell"** — no baseline, or one from another spec. It exits 0 and
     claims nothing; say so in one line and carry on. An absence is not evidence.

   WHAT WOULD FOOL THIS CHECK: it watches the **primary checkout** and nothing
   else, so a fix written into *another* spec's worktree would leak there unseen.
   Left unhandled deliberately — the cost of the gap is a missed leak, never a
   false accusation.

**Never commit on a `changes` pass.** It authorises the work, not a commit —
`approve` is the only verdict that reaches §2a. The fixes sit in the worktree
where the operator can read them on the next render, which is the whole point of
sending them back rather than approving.

## 2a. An approved pass commits — through the project's own skill

Only on an **honoured** `approve`. A refused one did not happen.

The engine names the skill to use on the verdict's `commitWith` — the
`review.commitWith` config key, `/commit` by default. Do not read the config
yourself; one answer, from the engine that owns it.

- **`none`** — record the verdict and commit **nothing**. Say so: the approval
  is on the record and the commit is the operator's to make.
- **A skill you have** — invoke it, and say which one. **Never vendor it.**
  `/commit` ships with **skittership**, a different package: it stages the
  task's files, runs the project's checks, and writes the release-note footers
  this repo's changelog is built from. A copy of it living here would be a fork
  of someone else's skill that drifts silently.
- **A skill you do not have** — commit it yourself: stage only the files this
  work touched, run the project's typecheck and test commands, and write a
  conventional commit. **Say that you did, every time.** A commit made under
  rules nobody configured must never be reported as one made under `/commit`.

**Decide availability from the skill list you already have**, never by testing
for a file. A skill can legitimately live in several places, so `.claude/skills/
commit/SKILL.md` missing is an absence that proves nothing
(`.claude/rules/negative-checks.md` rule 1) — and being wrong about it means
committing by hand while reporting a hand-off. You are told which skills you
have; that list is the answer.

**Let the commit's own failure be the answer.** If typecheck or the tests fail,
there is no commit — report the failure and stop. Do not fix the tests to get
the commit through, and do not commit around them.
**An approval judges the change; it never promises that it builds**, and the two
must not be conflated by a skill acting on someone's behalf.

**Then record what it produced**, so the page shows the outcome rather than the
intent:

```
skitterspec spec-env review <spec> --outcome "committed <sha> via <skill|by hand>"
```

That writes the outcome onto the decision the engine already logged and
re-renders the page, where it reads as history beneath the verdict bar. On a
failed commit there is no outcome to record — say what failed instead.

**Nothing is pushed.** The commit is local, exactly as `/commit` leaves it.

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

## 4. Render the page — or serve it

```
skitterspec spec-env review <spec>              # uncommitted work (the default)
skitterspec spec-env review <spec> --branch     # everything since the base branch
skitterspec spec-env review serve               # every spec, on localhost
```

**The engine handles the switch.** A file when the reader is at this machine, a
served URL when they are not: on a `remote` reader it stands its own server up
and puts a URL the reader can open on the `open:` line. Both are free and neither
publishes anything. You are not choosing between them; you are relaying whichever
one the engine printed.

The operator who does not want a LAN listener started for them sets
`review.serveOnRemote: false` in `env.config.json`, and the `file://` link with
its *will not open where you are reading* marker comes back.

`serve` renders **per request**, so nothing it shows can be stale, and it lists
every spec with a worktree rather than one. `--host 0.0.0.0` binds beyond
loopback and prints a URL a phone on the same network can open, guarded by an
unguessable path token. Bare, it binds loopback only. It is a process:
`--status` says whether one is up, `--stop` takes it down.

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

## 4a. Read the `reader:` line — never sniff for it yourself

`spec-env review` reports where it believes the reader is, and
**that is the only place this question is answered.** Three states:

| `reader:` | What to offer |
|-----------|---------------|
| absent (`unknown`) | the `file://` URL, exactly as always. **Do not warn** — unknown is the ordinary state of a local machine |
| `local` | the `file://` URL |
| `remote` | the `open:` line as printed — the engine already served it. Pass on any `also:` lines too |

**Never read an environment variable to decide this.** Not `SSH_CONNECTION`, not
`CLAUDE_CODE_*`, not a tty check — the engine already did it, reports the answer
on that line and in `--json`, and a second implementation here could not be
tested and would drift from the first. The ranking and the traps
(`CLAUDE_CODE_ENTRYPOINT` describes the *process*, not the reader; stdin is never
a tty under Claude Code) live in `review.js` beside the code, which is where they
belong.

**It authorises serving, never publishing.** A `remote` reader authorises a
local server — one process, ended by one flag, leaving nothing behind — and
nothing more. Publishing leaves a page this tooling cannot remove, so it is an
ask, in every case, always. The two were once one rule, and lumping them together
is what left a remote reader holding a dead link: see
`specs/complete/bug-remote-reader-gets-a-dead-link/`.

When serving fails — a busy port, or a machine with no network address — the
engine falls back to the `file://` URL with its marker and nothing breaks. That
is the one case where naming publishing is worth doing, because it is the only
answer left.

`review.reader` in `env.config.json` (`local` · `remote` · `detect`) lets the
operator settle where they are reading, and an explicit value is believed without
sniffing. `review.serveOnRemote` (default `true`) settles whether the engine may
act on it.

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
- **Say, once, that it is theirs now.** When you report a URL, say in the same
  breath that skitterspec cannot remove the page and that `/artifacts` (or the
  gallery at `claude.ai/code/artifacts`) is where it goes. This is the moment the
  decision is being made, so it is the moment worth saying it — `spec-env down`
  repeats it at teardown, by which point the page has outlived the spec.
- **Degrade in one line.** If the harness cannot publish — no capability, an
  error — say so, report the local file path, and carry on. That is a working
  outcome, not a failure.
- **Reach for `--publish-copy`, never a hand transform.** The engine writes the
  page as a complete HTML document and an artifact host wraps page *content*, so
  publishing the page as-written nests two documents. `spec-env review <spec>
  --publish-copy` emits the body-only copy and names its path on a `publish:`
  line. Do not split the document yourself: a rendered page contains the diff,
  and a diff of this project contains `<!doctype html>` as ordinary patch text.

The engine knows nothing about publishing and cannot do it. It writes a file and
reads a URL back as an opaque string; everything about what that string means
lives here.

## 7. Report

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — the page is rendered, and any review pass handed back was stored and
  acted on.
- `⚠️` — rendered, with something worth knowing: accepts that lapsed because the
  file changed, comments left unworked because the operator did not say go.
- `❌` — a render or a fix failed part-way. Quote it.
- `⏸` — the spec has no worktree. Say that plainly: a spec that has not been
  started has nothing to diff, which is an ordinary state and not an error.

**Fields:** `Built` · `Tests` · `Review` · `Follow-ups` · `Next`

`Review` carries the files and `+`/`−`, the page's `open:` line, and the
published URL when there is one. Where the page holds a review pass, it also
carries the three totals — files accepted, comments open, comments answered.
`--json` reports those under `notes.totals`; read that, never the diff.

`Built` appears only when this run actually changed code — the commented files
it worked on your go-ahead. A render on its own built nothing, and an empty
`Built` line claiming otherwise is worse than no field.

`Tests` and a commit appear only on the approve branch (§2a).
**Say which path made the commit** — the configured skill by name, or by hand —
in the same row as the sha. A reader cannot tell a `/commit` from a hand-rolled one after the
fact, so the run that made it is the only place that distinction can be
recorded.
