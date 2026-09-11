---
linear_identifier: "SKS-157"
linear_url: "https://linear.app/skitterbyte/issue/SKS-157/review-round-trip-accept-marks-and-comments-that-reach-the-agent"
---

# Review round-trip — accept marks and comments that reach the agent

> **Type:** Feature
> **Name:** feat-review-round-trip (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-11
> **Area:** packages/common/src/env/review.js, packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec-diff, packages/common/assets/rules, packages/common/test
> **Stack:** worktree

## Problem

`/spec-diff` renders a phase's diff as a page you can read anywhere, and there
the trail stops: the page is a read-out. Everything you conclude while reading —
this file is fine, that line is wrong, yes to the reviewer's question — has to be
retyped into chat from memory, and nothing you concluded survives into the next
phase's render. So a file you read carefully at phase 2 looks exactly like one
you have never opened at phase 4, and the model's `confirm` checks — which exist
solely to ask the author a question — are asked on a page that cannot take an
answer.

`feat-phase-review` deferred this deliberately, on one condition:
*"revisit it with evidence, not with an assumption."* The evidence in question
was whether a runtime capability existed at all. This is the revisit — and the
evidence changed the design rather than unblocking the old one (Decision 1).

## Decisions

1. **The clipboard is the transport, not a runtime capability.** The page keeps
   marks in the DOM and a **Copy review** button puts a compact JSON delta on the
   clipboard; you paste it into chat and the agent hands it to the engine.
   *Evidence for the deferred question:* the artifact `db` capability **is**
   available (runtime contract 0.2.45) — so the original blocker is gone, and it
   is still the wrong foundation. `db` reaches only a *published* page in a
   Claude harness that grants it; the local `file://` page — the common case, and
   the only case for an adopter on another harness — cannot participate at all.
   The blob works identically everywhere. Rejected: `db` round-trip (splits the
   feature in two by where you happen to be reading); artifact comment threads
   (free, but carry no per-file state and nothing survives a re-render).
2. **An accept is keyed to the file's content hash, never to its patch.** The
   engine records `git hash-object` for each changed file and the page sends that
   hash back with the accept. Hashing the *patch* would lapse every accept the
   moment `/spec-next` commits the phase — the ref moves, so the patch changes
   while the file does not — and again on every `working`↔`branch` switch. Content
   keying makes an accept mean "I read this file as it stands", which survives
   both.
3. **A lapse is announced, never silent.** Content hash differs from the accepted
   one → the file renders `accepted earlier — changed since` and is *not*
   accepted. Being wrong in the other direction means silently vouching for code
   nobody read, so the cannot-tell case routes to un-accepted
   (`.claude/rules/negative-checks.md`). A blob whose hash matches nothing current
   is recorded as given and simply renders lapsed — it is not an error.
4. **The page sends the hash it was rendered with.** Not "accept path X" for the
   engine to stamp with whatever X hashes to now: a tab left open across a phase
   would then vouch for code that arrived after you read it. The accept carries
   the hash of what was actually on screen.
5. **Notes merge; they never replace.** The blob is a delta (accepts + new
   comments), and the engine merges it into `.spec-env/reviews/<spec>.notes.json`.
   Replacing would drop the agent's resolutions, and a stale tab would silently
   roll back newer state. Comment ids are `<generatedAt>-<n>` — stable per render —
   so re-pasting the same blob is idempotent rather than duplicating.
6. **A comment anchors to a file, optionally a line, and keeps that line's text.**
   The note records `file`, `line` and `lineText`, so the agent can still find the
   place after the line has moved. Rejected: line *ranges* — real
   selection UI to build and a worse staleness story for the same information.
7. **Resolutions are the agent's half of the same file.** After working a
   comment the agent writes `{id, note}` back through `--resolve`, and the next
   render shows the comment struck through with a one-line what-I-did. That is
   what lets you verify a fix on the next read instead of trusting it.
8. **Model checks get a reply box; replies ride back as comments.** A `flag` or
   `confirm` in the written review is answerable where you read it, arriving in
   the same blob tagged with the check it answers.
9. **Intake lives in `/spec-diff`, and reports before it edits.** The skill that
   renders the page reads the notes back: it plays back the accepted set and the
   open comments, names the files it would touch, and waits. `/spec-diff` is
   otherwise read-only and gated on nothing — a paste silently triggering edits is
   a surprise, and a misread comment then costs a revert. Rejected: a twelfth
   skill (every description is a per-session tax on every user); `/spec-next`
   intake (you could not act on a review without starting a phase).
10. **The engine still never reads the diff to the model.** Accepts, comments and
    resolutions are a few hundred bytes of JSON; `--json` surfaces per-file
    `accepted`/`hash`/`comments` so intake costs a tiny read and never the patch.
    Files you accepted are the files the agent then does *not* open.

## Solution overview

```
  page  ──[ Copy review ]──▶  clipboard JSON delta
                                     │  you paste into chat
                                     ▼
  agent ── scratch file ──▶  spec-env review <spec> --notes <file>
                                     │  merge
                                     ▼
                         .spec-env/reviews/<spec>.notes.json
                                     │
        ┌────────────────────────────┴───────────────────────────┐
        ▼                                                        ▼
  re-render: ✓ / ⚠ lapsed / 💬 open / ̶r̶e̶s̶o̶l̶v̶e̶d̶      --json: the agent's worklist
                                                                 │
                                       agent works the comments, then
                                       spec-env review <spec> --resolve <file>
```

The notes file is engine-owned and versioned:

```json
{
  "version": 1,
  "spec": "feat-x",
  "updatedAt": "2026-09-11T…",
  "files": { "src/env/review.js": { "acceptedHash": "a1b2c3…", "acceptedAt": "…" } },
  "comments": [
    { "id": "2026-09-11T…-1", "file": "src/env/review.js", "line": 142,
      "lineText": "  return { patch, whole }", "check": null,
      "note": "hash the content, not the patch", "raisedAt": "…",
      "resolved": { "at": "…", "note": "keyed accepts on git hash-object; lapse test added" } }
  ]
}
```

It lives beside the page and the `.url` file under gitignored `.spec-env/`, so a
review leaves no trace in the branch under review.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI flag | add | `spec-env review --notes <json>` (merge a page blob) |
| CLI flag | add | `spec-env review --resolve <json>` (attach resolutions by id) |
| CLI output | update | `--json` gains `notesFile`, per-file `hash`/`accepted`/`comments`, totals |
| Engine module | update | `env/review.js`: `fileHashes`, notes read/merge/validate, lapse computation |
| Page asset | update | `review/page.html`: accept toggles, line + file comments, check replies, Copy review |
| Data file | add | `.spec-env/reviews/<spec>.notes.json` (gitignored, engine-owned, `version: 1`) |
| Skill | update | `/spec-diff` gains the intake + resolve steps |
| Rule/docs | update | `spec-planning.md` and the docs site `/spec-diff` paragraph |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Notes store, content hashing and the lapse rule | ⬜ | [01-notes-store.md](01-notes-store.md) |
| 2 | Page marks, comments, check replies, copy-out | ⬜ | [02-page-marks.md](02-page-marks.md) |
| 3 | Resolutions round-trip | ⬜ | [03-resolutions.md](03-resolutions.md) |
| 4 | `/spec-diff` intake and docs | ⬜ | [04-skill-and-docs.md](04-skill-and-docs.md) |

## Non-goals

- **Artifact `db` round-trip.** Decision 1. Revisit only if the paste proves to
  be the friction, and as an *upgrade* to the blob, never a replacement.
- **Gating anything on review state.** `/spec-diff` is gated on nothing and must
  not become a gate; `/spec-complete` does not learn about unaccepted files.
- **Line ranges, and human-to-human threads.** Decision 6.
- **Rejecting unknown `spec-env` options.** The parser pushes an unrecognised
  `--flag` into the positional list, so a typo'd `--note` becomes a spec name.
  Real, adjacent, and a behaviour change for all eleven verbs — its own spec, not
  a rider on this one.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-11 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-11 — Spec created. Picks up the follow-on `feat-phase-review` deferred
  with "revisit with evidence": the `db` capability is now confirmed available,
  and the evidence argued *against* it (local `file://` pages cannot use it), so
  the design is clipboard-first instead.
