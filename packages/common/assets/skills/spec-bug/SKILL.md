---
name: spec-bug
description: Investigate a bug, capture it as a Bug-type spec, and drive it red→green. ALWAYS starts by reproducing the bug with a failing test, then writes the spec and works the test to green — on the bug's own branch, never on main. Use when the user reports a bug, says "/spec-bug", "investigate this bug", "this is broken — find and fix it", or pastes an error/stack trace.
---

# /spec-bug — investigate a bug, prove it with a failing test, fix it

> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure at the moment it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.

This is the **bug** counterpart to `/spec` (which is for **features**, plan-only).
Unlike `/spec`, this skill is hands-on and test-first: it reproduces the bug as a
**failing test (RED)**, captures a lean Bug spec, then works the test to **GREEN**.

Spec type convention (see `.claude/rules/spec-planning.md`):
- Bug specs are named `bug-<kebab-name>`; feature specs `feat-<kebab-name>`.
- Every spec header carries `> **Type:** Bug` (or `Feature`).

<!-- seam:spec-tracker-intake -->

## 1. Reproduce & isolate (light investigation)

Bugs are concrete — confirm, don't over-grill. Establish:

- **Repro:** exact steps / input that triggers it. Ask only if you can't derive it.
- **Expected vs actual:** what *should* happen vs what does.
- **Scope & blast radius:** which module(s)/endpoint(s)/package; one tenant or all.
- **Root cause:** read the code, trace it to `file:line`. Compare a working path
  against the broken one (the bug usually lives in the differential). Do NOT
  patch a symptom before you understand the cause.

## 2. Isolate the fix in a worktree — when isolation is enabled

**Only when per-spec isolation is enabled** (`specs/.core/env.config.json`
exists). Skip this whole section otherwise — the fix happens in place, on the
current branch.

**Opt-out:** if the user passes `--no-worktree` (or explicitly asks to work in
place), skip this whole section and fix on the current branch — same as when
isolation is off. Warn that the fix will land wherever you currently are (usually
`main`); reserve it for a trivial one-liner or an explicit request.

A bug fix changes real source, so — exactly like `/spec-start` — it belongs on the
bug's **own branch**, never directly on `main`. Provision the worktree **now**,
before the failing test, so the test, the fix, and the spec all land together and
arrive as one reviewable PR.

The engine resolves a spec by its folder, so seed a **minimal stub** for it to
provision from — you'll flesh it out in §4:

- From the base branch (`main`), create
  `specs/in-progress/bug-<name>/00-overview.md` with just the header block and the
  `## Symptom` you established above.
- Run `skitterspec spec-env up bug-<name>` (the `spec-env` CLI engine). It prints
  the `git worktree add … -b bug/<name>` command (a branch forked from `main`),
  the worktree path, and any `in the worktree, run:` bootstrap steps.
- Run the printed commands in order. The plan **commits the stub first** — the
  worktree forks from `main`'s last commit, so the stub has to be in it — and
  then adds the worktree. Nothing to move afterwards: the spec is already there.
  The commit is planned, not silent; it appears in the printed plan above the
  `git worktree add`, and `spec-env up` refuses outright if anything *other* than
  this spec is uncommitted.
<!-- seam:worktree-bootstrap -->
- **Do everything below in the worktree**, on the branch — the red test, the fix,
  and the rest of the spec. Act on the worktree with absolute paths /
  `git -C <worktreePath>`, or open a session rooted at the printed path. `main`
  changes only when the branch merges (at `/spec-complete`).

## 3. Write the failing test FIRST (RED) — mandatory

Encode the **correct** (expected) behaviour as a test, then run it and confirm it
**fails for the right reason**:

- Put it where the suite already covers that area. Reuse existing test helpers /
  factories; follow the project's test rules (see `.claude/rules/`). Never
  hardcode dates — compute them relative to now.
- Run it with the project's test command. Quote the red output. A test that
  passes before the fix proves nothing — keep refining the assertion until it
  genuinely captures the bug.

## 4. Write the Bug spec

Fill in the spec's entry point `00-overview.md`. **When isolated**, you already
seeded this stub in §2 and moved it into the worktree — flesh it out there.
**When not isolated**, create the spec **folder**
`specs/in-progress/bug-<kebab-name>/` with its entry point `00-overview.md` now
(every spec is a folder — never a bare file). A bug is
usually a single-pass fix, so the `## Fix` block can live directly in
`00-overview.md`. **If the fix needs phasing** (large/uncertain root cause),
split it into phase files (`01-<slug>.md`, `02-…`) with a phase index in
`00-overview.md`, exactly like a feature spec. It starts in `in-progress`
because work is already underway. Keep it lean:

```markdown
# Bug: <short title>

> **Type:** Bug
> **Name:** bug-<kebab-name> (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** <git user.name — who reported/captured it>
> **Developer:** <git user.name — you, since you're fixing it now>
> **Raised:** <YYYY-MM-DD (today)>
> **Area:** <files/modules>
> **Gating:** <flag name — or "none: <one-line reason>". Only when release gating
> is configured; omit the line entirely otherwise>

## Symptom

<observed wrong behaviour + repro steps; paste the error/stack if any>

## Root cause

<the actual cause, at `file:line`. One paragraph — be specific.>

## Failing test (red)

<test name + path; what it asserts. How to run it. Paste the red failure line.>

## Fix

- [ ] <the minimal change that addresses the root cause, not the symptom>
- [ ] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [ ] <any follow-up hardening, or "None">

## Impact

<!-- seam:impact-map-guidance -->

<A bug fix often changes no external surface — that's fine, use the
one-liner.>

| Surface | Change | Detail |
|---------|--------|--------|
| <e.g. Endpoint> | update | <e.g. GET /orders (fix null total)> |

<_No external surface changes — internal refactor only._ — use this line in
place of the table when the spec touches no external surface.>

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| <YYYY-MM-DD> | In Progress | in-progress | <developer> |

## Changelog

- <YYYY-MM-DD> — Bug reproduced; failing test added (red).
```

The **State log** is the folder/status audit trail; later transitions
(`/spec-complete`, `/spec-cancel`) append a row. The **Changelog** is for the
fix narrative and decisions — keep them separate.

<!-- seam:spec-tracker-link -->

<!-- seam:spec-tracker-assign -->

<!-- seam:spec-project-picker -->

### Release gating (only when configured)

**Only when `specs/.core/gating.config.json` exists.** Before writing the spec,
ask: should this fix ship behind a feature flag, or land live?
**Offer, don't impose** — cite the project's own `guidance` path when the config
names one, and
record the answer either way, as a flag name or `none: <one-line reason>`.

A bug fix ships in the next release exactly like a feature, so it gets the same
question rather than an assumption. A risky rewrite of a broken path is precisely
where a kill-switch earns its keep; a one-line null check is precisely where
`none:` is the honest answer. Skip entirely when the config is absent.

## 5. Drive to GREEN

- Implement the **minimal, root-cause** fix. Match surrounding code; honour all
  project rules (see `.claude/rules/`).
- Re-run the failing test → it must pass. Then run the project's typecheck and
  test commands to confirm no regressions. Quote results.
- Tick the Fix tasks, add a Changelog line (`- <date> — Fixed: <one line>; test green`).

If the root cause is large/uncertain and can't be fixed in one pass: keep the red
test, split the fix into phase files (`01-<slug>.md` …) with a phase index in
`00-overview.md`, and leave the spec in `in-progress` for `/spec-next` to continue.
Say so explicitly — don't fake green.

**Then refresh the mirror (only if a provider is installed).** The Fix tasks are
ticked, so the repo is now the truth about this fix — and this skill can take a
bug all the way to green without `/spec-next` ever running. Without a provider this
is a no-op.

<!-- seam:spec-tracker-progress -->

## 5b. Render the page — then offer the review, never write it

**Only when the project has per-spec isolation** (`specs/.core/env.config.json`
present). Without it there is no worktree to read and this step does not exist —
skip it in silence rather than explaining an absence.

The fix is green and nothing is committed yet. That is the moment the page is
about, so render it now — **after** the tests pass and **before** the commit:

```
skitterspec spec-env review <spec>
```

**This is free.** The engine reads git and splices the patches into a template;
the diff never passes through you, so a 266KB patch costs nothing.

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


Relay the **`open:`** line rather than the bare path: a path is not clickable in
any terminal, and a page nobody can open is a page nobody reads.

- **Never write the review unasked**, and **never publish**. Publishing leaves
  something behind that this tooling cannot remove, so it is always an ask. A
  `file://` link is no use on a phone, and saying so **is** the ask —
  `/spec-diff` §6 owns how.
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

- **Never fatal.** A failed render — no worktree, a git error — is one line, and
  the fix is still done. The page is a convenience; the repo is the record.

## 6. Report

Do **not** `git commit` unless the user asks. The spec stays in `in-progress`;
`Next` points at `/spec-complete` to verify and archive it (**when isolated**,
the fix lives on the bug's branch, and `/spec-complete` merges it back to
`main`).

End with the block defined in `.claude/rules/spec-reports.md`. That file carries
the shape; this section carries only what is specific here.

**Verdicts**

- `✅` — red→green, the fix is in and the suite passes.
- `⚠️` — green, with something worth knowing (a narrowed repro, a mirror that
  did not refresh).
- `❌` — the test is still red, or a later test broke. Quote the failure.
- `⏸` — the bug could not be reproduced, so nothing was written. Say what was
  tried; an unreproduced bug is a finding, not a failed run.

**Fields:** `Tracker` · `Branch` · `Spec` · `Cause` · `Built` · `Tests` ·
`Review` · `Follow-ups` · `Next`

`Cause` is the root cause in one clause and `Built` is the fix — the
failing→passing test belongs in `Tests`, named, so the evidence is a test name
rather than an adjective.

Step 5b's offer is the `Review` row, not a paragraph after the block — the
counts, the link and the question in one row. Nothing follows the block.
