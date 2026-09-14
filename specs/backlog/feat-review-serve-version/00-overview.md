---
linear_identifier: "SKS-222"
linear_url: "https://linear.app/skitterbyte/issue/SKS-222/the-review-server-notices-the-engine-moved-under-it"
---

# The review server notices the engine moved under it

> **Type:** Feature
> **Name:** feat-review-serve-version (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-14
> **Area:** packages/common/src/env/serve.js, packages/common/src/cli.js, packages/common/test
> **Stack:** worktree

## Problem

`spec-env review serve` renders each page **per request**, using the engine it
loaded when it started. Nothing re-reads that engine, so a server started before
an upgrade goes on rendering with the old one indefinitely — and says nothing.

This is not hypothetical: it is how `feat-review-verdict` shipped a verdict bar
that its own author could not see. Four phases were built, the page was
re-rendered after each, and every URL handed over served a pre-feature page. The
render **was** current — `generatedAt` moved, the file counts moved, the diff was
right — only the renderer was old, which is precisely why nothing looked wrong.
It was found by curling the served HTML and grepping for a control that should
have been in it.

The cost is worse for an adopter than it was here. Upgrading skitterspec while a
server runs leaves every reader on the old renderer, and the thing they are
reading is the artefact they are supposed to trust.

## Decisions

1. **Restart it, do not merely warn.** A warning leaves the reader holding a
   stale page and a chore. The engine knows it is stale and can fix it in the
   time the warning would take to read. Rejected: reporting the mismatch and
   leaving it (correct, and still makes the human do the work); refusing to serve
   (turns a cosmetic lag into an outage for everyone reading).
2. **Restart without asking, and say that it did.** The action is cheap,
   reversible and exactly what the operator wanted; a prompt would be a question
   with one sensible answer. But it is still an action taken on someone's behalf,
   and this repo's contract is that those get one line — the same rule
   `/spec-complete`'s teardown follows.
3. **Compare a recorded version against the running one — a positive signal.**
   The server stamps what it loaded into its settings file at startup; the CLI
   compares that against its own. Not "is the source newer than the process"
   (mtimes lie across a dev-link, a rebuild and a `git checkout`), and not "does
   the page look wrong" (that is the check that failed here — by eye, and only
   once someone knew what to look for).
4. **The page says which engine drew it.** Independent of the restart, and worth
   having on its own: a served page carries the renderer's version in its footer,
   so the question "is this current?" is answerable by reading the artefact
   rather than by grepping it. This is the check that would have caught the
   original incident in seconds.
5. **A restart must not lose a pending pass.** `feat-review-post-back` gives the
   server a holding area; if that lived in memory this feature would become a new
   way to lose work. The two specs are independent, and this is the constraint
   between them — recorded in both, whichever lands first.
6. **Cannot tell means carry on.** No recorded version (a server from before this
   shipped), an unreadable settings file, a version that does not parse: these
   exit 0, say nothing, and change nothing. An absence is not evidence that
   anything is stale (`.claude/rules/negative-checks.md` rules 1 and 4).

## Solution overview

```
  spec-env review <spec>
    ├─ server running?          no  ▶ start it, as today
    └─ yes: recorded 9.2.0, mine 9.3.1
            ▶ restart it
            ▶ "the server was running engine 9.2.0; restarted on 9.3.1"

  no version recorded  ▶ silence. It cannot tell, so it claims nothing.
```

The page footer gains one line — `rendered by skitterspec 9.3.1` — which is the
half that makes the whole thing checkable from the reader's side.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Serve settings | add | `engine` — the version the running process loaded |
| Engine | add | `staleServer(recorded, running)` → `current` · `stale` · `unknown` |
| CLI | update | `spec-env review` restarts a stale server and says so |
| CLI | update | `spec-env review serve --status` reports the running engine |
| Page | add | footer line naming the engine that rendered it |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Record and compare the engine | ⬜ | [01-record-and-compare.md](01-record-and-compare.md) |
| 2 | Restart it, and say so | ⬜ | [02-restart-and-say.md](02-restart-and-say.md) |

## Non-goals

- **Watching the source and restarting on change.** A file watcher restarts on
  every save while someone is editing, which is a different feature with a
  different failure mode. The comparison happens when a render is asked for,
  which is the moment it matters.
- **Versioning the page format.** This is about which *engine* drew the page, not
  about whether an old page is still readable. A rendered page stays a
  self-contained artefact and is not invalidated by anything here.
- **Restarting anything else.** The proxy and the dev servers have their own
  lifecycle and their own reasons to be left alone.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-14 — Spec created, from the incident during `feat-review-verdict`: a
  server started before phase 2 served a pre-phase-2 page for the rest of the
  session, and the operator reported the feature as missing. Written as a
  restart rather than a warning on the operator's call; the warning was the
  recommendation, and the argument against it — that it hands the reader a chore
  the engine could have done — won.
