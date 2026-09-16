---
linear_identifier: "SKS-307"
linear_url: "https://linear.app/skitterbyte/issue/SKS-307/every-render-serves-so-no-link-depends-on-a-guess"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Every render serves, so no link depends on a guess

> **Type:** Feature
> **Name:** feat-every-render-serves (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-16)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** packages/common/src/cli.js, packages/common/src/env/review.js, packages/common/src/env/config.js, packages/common/test/env-review-reader.test.js
> **Stack:** worktree

## Problem

A render on the Mac hands back a `file://` link. That is the reported symptom and
the worst of it: the page opens, but a `file://` page **has no server to POST
to**, so the button cannot hand a verdict back and the whole
press-the-button-and-the-run-continues loop is absent from exactly the sessions
that are otherwise easiest to use.

The cause is that serving is gated on guessing where the reader is sitting.
`detectReader` reads three signals — `SSH_CONNECTION`, `SSH_TTY`,
`CLAUDE_CODE_BRIDGE_SESSION_ID` — and answers `remote`, or `unknown` when it sees
none. `cli.js:2587` then serves only `if (reader.reader === 'remote' && …)`. A
local session has no signal, so it never serves, so it gets a `file://` link.

Two things make this a design fault rather than a detection gap. **The detection
is already documented as not being allowed to do this** — `detectReader`'s own
comment says *"This decides wording and nothing else. Nothing in the engine
serves, publishes or refuses on the strength of it"*, and serving was wired to it
later without revisiting that. And **two tests pin the gate shut** — `a local
reader starts no server at all` and `an unknown reader starts no server either`
— so the suite is robustly enforcing the behaviour that produced the symptom.
Nothing regressed; the design is what is wrong.

The remote/LAN path is **not** in scope. It works, it has been used from a phone
since the last round of work on it, and this spec must not disturb it.

## Decisions

1. **Serving becomes unconditional.** Every render stands the server up (or
   adopts a running one) and hands back an `http://` URL. Rejected widening
   detection with more signals: the failure is that a *guess* decides whether the
   loop exists at all, and a better guess is still a guess.
2. **The bind rule does not change.** `remote` binds `0.0.0.0` exactly as today;
   the newly-serving `local` and `unknown` cases bind **loopback**. So this adds
   **no network exposure anywhere** — it replaces a `file://` link with
   `http://127.0.0.1:<port>/…`, which opens on the machine holding the page and,
   unlike `file://`, can POST. Rejected binding `0.0.0.0` by default: it would
   reheat a settled question and expose local sessions to buy nothing the
   loopback URL does not already deliver on the Mac.
3. **`unknown` binds loopback, not `0.0.0.0`.** Cannot-tell routes to the
   harmless branch (`.claude/rules/negative-checks.md` rule 4). An unknown reader
   who turns out to be remote is the one case still needing a nudge, and it keeps
   the existing one: the printed `serve:` hint naming
   `review serve --host 0.0.0.0`.
4. **`serveOnRemote` is replaced by `review.serve: "always" | "never"`**, because
   the old name would govern every render while claiming to govern remote ones,
   and a config key that lies is what made this session's first fix look correct
   when it was not. A legacy `serveOnRemote: false` is read as `"never"` at load
   time — tolerance, not migration, the same way `readVerdict` absorbs the old
   `approve` spelling. These configs are committed, so a rename with no tolerance
   breaks other checkouts.
5. **Detection survives, demoted to wording only** — which restores the contract
   its own comment already states rather than inventing one. It still earns its
   keep on the one path left: when serving *fails*, `remote` is what makes
   *"will not open where you are reading"* true rather than noise.
6. **No committed config encodes where the reader is sitting.** `review.reader`
   stays configurable, but after this nothing about *serving* depends on it, so
   setting it is no longer the workaround for a dead link. That workaround was
   wrong in shape: the fact is session-scoped, the file is committed, and it is
   unsettable from the device where it matters.
7. **A failed serve still falls back to `file://`.** A busy port or a refused
   spawn is not evidence of anything wrong with the repo, and the page is a
   convenience while the repo is the record.

## Solution overview

`specEnvReview` stands the server up on every render, binding by the existing
reader rule, and reports the served URL. `review.serve: "never"` is the only way
out, with `serveOnRemote: false` read as that. `detectReader` keeps its three
signals and its `unknown`, and from here decides only what the output *says* —
its stale comment becomes true again. The `file://` link appears only when
serving could not happen.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review` serves on every render, not only for a remote reader |
| Route/UI | update | served route renders a spec with no worktree (was 404); index lists it |
| Config key | add | `review.serve: "always" \| "never"` (default `always`) |
| Config key | remove | `review.serveOnRemote` — `false` still read as `serve: "never"` |
| Business rule | update | `detectReader` decides wording only; bind rule unchanged |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Serving stops asking where the reader is, or for a worktree | ✅ | [01-serving-is-unconditional.md](01-serving-is-unconditional.md) |
| 2 | Detection goes back to deciding wording | ✅ | [02-detection-decides-wording.md](02-detection-decides-wording.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |
| 2026-09-16 | In Progress | in-progress | Reuben Greaves |
| 2026-09-16 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-16 — Spec created after a render on the Mac returned a `file://` link.
  A committed `review.reader: "remote"` was tried first and reverted: it worked,
  but it encodes a session-scoped fact in a committed file and cannot be set
  from a phone.
- 2026-09-16 — Phase 1 widened before it started: `serve.js` has its own
  worktree gate (404 on three call sites) separate from the decision to serve,
  and it is the one that 404s an authoring page. Found by curl'ing the LAN URL
  and getting 404 from loopback too; confirmed by a fresh server reporting
  "serving 0 specs" with no worktrees, then 200 once one existed.
- 2026-09-16 — Phase 1: the docs classification moved into `classify.js` and is
  now shared by the CLI and the server, so the served and written pages cannot
  disagree. Fourteen test scaffolds gained `serve: 'never'` — serving everywhere
  otherwise spawns a daemon per review test, and one run leaked 60. The
  `env-serve-start-proof` port guard was widened from `scaffold('remote')` to
  every reader and immediately caught two offenders.
- 2026-09-16 — Phase 2: the plan asked for `detectReader`'s comment to be
  restored as written, which would have been false a second time — phase 1 kept
  `reader` for the bind. The comment now says it decides the wording and the
  bind and not whether to serve, and three guards pin that: serving must not
  read the reader, the bind must, and the comment must still record the cost.
  A `file://` render now also says why it fell back.
- 2026-09-16 — Completed; both phases done, 2838 tests green. Two follow-ups
  recorded rather than folded in: the dev daemon runs the gitignored dist build
  instead of the source being edited, and `verdictSaid` reads an unnamed
  committing verdict as `discuss first`.
