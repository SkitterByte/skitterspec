## Spec workflow

Spec-driven development runs through the lifecycle **skills** — use them so
structure and lifecycle stay consistent. The everyday loop is
**`spec → start → next → commit → complete`**, with **`/spec-diff`** to read what
a phase changed and `/spec-connect` when you want to test the spec in a browser.

**Skills vs commands.** The lifecycle skills are read by Claude, which exercises
judgment. `/spec-connect` and `/spec-live` are **slash commands** instead — each
pre-executes one `spec-env` verb and relays it, so only you can run them; a
skill that wants one will tell you to type it.

**Seeing the work.** A phase is built in its own worktree, so `git diff` in your
terminal answers about the base branch. **`/spec-diff`** renders that worktree's
diff as a self-contained HTML page you open locally — or publish, and read on a
phone. The diff never passes through the model, so the page costs no context
tokens however large it is; the optional written review is the part that costs,
and it is offered rather than assumed. `/spec-next` writes the page at the end of
every phase. **`skitterspec status`** lists what is in flight across worktrees.
At the end of the day, **`/spec-tada`** is the ta-da list: what you did across
every project, grouped by spec — what landed, what was explored, what is still
in flight — ending in a three-line standup (`skitterspec tada` is the engine).

**Handing the review back.** The page takes marks: tick `✓ accept` per file as
you read, note anything against a line or a whole file, answer the questions a
written review asked — then **end it in a decision**. At the end of a phase the
buttons are `✓ Commit`, `✓ Commit & Continue` (commit, then build the next
phase), `↺ Request changes` and `… Discuss first`. A spec that has just been
written gets `✓ Commit & Start` instead — the `commit-start` verdict, which is
the `commit && /spec-start` you would otherwise type. A **served** page hands
the pass to the engine, which **holds** it and shows a six-digit code. Committing
is unavailable while a note is open — you asked for something, so it cannot also
be fine — and it hands off to your own commit skill (`review.commitWith`,
`/commit` by default) rather than a copy living here. Fixes come back as
resolutions, so the next render shows each note struck through with what changed.
An accept remembers the file's content, so it lapses by itself when that file
changes again. The marks are information — nothing gates on them; the verdict is
the one thing you choose, once.

**The phase waits for that press.** `/spec-next` ends a phase by rendering the
page and then watching for your verdict, so the button is what carries the work
on — no command to remember. What makes that safe is not that the page is
unreachable (it is reachable, deliberately): it is the **serve token** in the
URL, 48 random bits deciding who can POST at all, plus the **window** — only a
pass that arrives *while the session is waiting* is claimed for you, and two
arrivals refuse rather than pick. Outside that window nothing is claimed
unasked: type `/spec-reviewed`, or `/spec-reviewed 324199` to name one exactly,
which matters only when two are waiting. A `file://` page has no server to talk
to, so it copies and you paste, as before.

**And a phase that ended owes you an answer.** The gate is armed when the page
is rendered at the end of a phase, and cleared by a committing verdict or by
`skitterspec spec-env review skip "<reason>"` — while it is armed, `/spec-next`
refuses to build the next phase. Mid-phase renders arm nothing, every
cannot-tell exits 0 and says nothing, and `review.required: false` turns it off
for a project. The exit is always one command; one of them is *"I am moving
on"*, and that reason goes on the record.

**A second opinion, when you want one** (`review.reviewers`, empty by default).
Point it at a code reviewer that runs from your terminal — CodeRabbit's CLI has
a free tier and `{ "use": "coderabbit" }` is the whole setup; anything printing
[rdjsonl](https://github.com/reviewdog/reviewdog) works too — and its findings
land on the page beside your own notes, each badged with the tool that found it
and linked to the line it is about. `/spec-next` runs them once per phase;
`/spec-diff --reviewers` is the mid-phase ask. **They never block a commit** —
reply to one and your reply does, because then a person has asked for something.
A reviewer that could not run says `did not run — <why>` rather than passing as
clean, because on the page you commit from those two must not look alike.
Adding one sends your diff to whatever the command talks to, which is why the
list starts empty and `init` never writes one.

**Above the verdicts sits one line that is not a verdict.** `▶ Put it live`
commits the phase, checks the branch out where your dev server can see it, and
hands you back the same page with the same options — so you can judge the change
by *using* it, not only by reading it. It clears no gate: you have looked at it
running and concluded nothing, so the phase still owes an answer.

**Every render lists where the page can be read**, labelled, in a fixed order —
`local`, `network`, `remote` — each either a URL or the one command that turns it
on, plus a `live:` line saying whether the change is also running. `local` and
`network` are two doors into one room: the same server and the same waiting
verdict, so one wait covers both. `remote` is a published page, a second store —
a verdict there needs `/spec-reviewed`, and it stays off until someone types
**`/spec-remote-review`**, which toggles it. Publishing is permitted by that
command, never performed by it: a published page is one this tooling cannot
remove.

**One ending.** Every spec skill finishes with the same block — a verdict
(`✅` · `⚠️` · `❌` · `⏸`), then a table of the fields that skill declares,
ending on the one thing to do next. A refusal emits it too, so "nothing
happened" is reported rather than absent, and `Follow-ups` is always there
because a recorded `none` is a decision. Skills stay quiet while they run. The
shape lives in **`.claude/rules/spec-reports.md`**.

The skill table, the spec type/folder conventions and the per-spec isolation
model all live in **`.claude/rules/spec-planning.md`**, the canonical reference
every spec skill points at. Tailor its per-phase test commands to this stack.

**Release gating** *(only when `specs/.core/gating.config.json` exists)* — each
spec records whether it ships behind a feature flag, as
`> **Gating:** <flag name>` or `> **Gating:** none: <one-line reason>`. `/spec`,
`/spec-bug` and `/spec-hotfix` ask; `/spec-review`, `/spec-start` and
`/spec-complete` report a spec that has no answer, and never block over it.
`skitterspec gating check` lists them and always exits 0. The point is that the
question is **on the record**: a missing line is an oversight, a reason is a
decision. Skitterspec never reads your flag system — it asks and cites the doc
you point it at. Without that config, none of this appears.
