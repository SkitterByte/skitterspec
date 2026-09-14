# skitterspec

<!-- skitterspec:start -->
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
every phase.

**Handing the review back.** The page takes marks: tick `✓ accept` per file as
you read, note anything against a line or a whole file, answer the questions a
written review asked — then **end it in a decision**. Three buttons, each
carrying its own verdict:
`✓ Commit` commits it, `✓ Commit & Continue` commits and builds the next phase,
`↺ Request changes` sends it straight back to be worked, `… Discuss first` asks
you what's up. A **served** page hands the pass to
the engine, which **holds** it and shows a six-digit code. Type `/spec-reviewed`
and the waiting pass is picked up and acted on; paste the code after it
(`/spec-reviewed 324199`) to name one exactly, which matters only when two are
waiting. **Nothing pushes** — a device that reaches your page cannot reach this
conversation, which is what keeps a stray approval out of your review, and is
why the code is an address rather than a password. A `file://` page has no server to talk to, so it
copies and you paste, as before. Approve is unavailable while a note is open —
you asked for something, so it cannot also be fine — and it hands off to your
own commit skill (`review.commitWith`, `/commit` by default) rather than a copy
living here. Fixes come back as resolutions, so the next render shows each note
struck through with what changed. An accept remembers the file's content, so it
lapses by itself when that file changes again. The marks are information —
nothing gates on them; the verdict is the one thing you choose, once.

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
<!-- skitterspec:end -->

<!-- skittership:start -->
## Release tooling

This project uses **skittership** for commits, changelog, and user-facing release
notes. See `.claude/rules/commit-messages.md` for the full commit grammar.

- **Commit with `/commit`** — stages task-related files, runs typecheck + the
  relevant tests, then writes a Conventional Commit (`type(scope): subject`).
- **`Release-Note:` footer** — add it to any user-visible commit (a plain-English,
  benefit-framed sentence). `Release-Note!:` promotes the note into the release
  Highlights; `Release-Area:` overrides the scope→area mapping; `Release-Note:
  none` marks a commit explicitly not user-facing.
- **Generation** — the dev-facing changelog (`CHANGELOG.md`) and the user-facing
  release notes (`RELEASES.md`) are regenerated from commits at `npm version`
  (when the hook is wired), or on demand via `npm run changelog` / `npm run
  releases`. Filenames, product name, and the scope→area map live in
  `skittership.config.json`.
<!-- skittership:end -->

> **In this monorepo**, the paragraph above describes skittership's default
> single-package flow. Here the `npm version` hook and the `changelog`/`releases`
> scripts are deliberately absent: `scripts/release.js` edits each package's
> `package.json` directly, so no `version` lifecycle hook fires, and the shipped
> generator walks one tag series where this repo has two. Release notes are
> written per package by `scripts/release-notes.js`, which `release.js` runs as
> part of a release — see [RELEASING.md](./RELEASING.md).
