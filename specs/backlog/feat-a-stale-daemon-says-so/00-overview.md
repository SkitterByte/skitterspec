---
linear_identifier: "SKS-318"
linear_url: "https://linear.app/skitterbyte/issue/SKS-318/a-stale-daemon-says-so-and-stands-aside"
---

# A stale daemon says so, and stands aside

> **Type:** Feature
> **Name:** feat-a-stale-daemon-says-so (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-17
> **Area:** packages/common/src/cli.js, packages/common/src/env/serve.js, packages/common/test/
> **Stack:** worktree

## Problem

The review daemon answers from `node_modules/@skitterbyte/skitterspec`, which in
this repo symlinks to `packages/skitterspec` — the **gitignored dist build**. So
a session editing `packages/common/src` is served by a process running the last
build, and nothing says so.

It is invisible by construction. `staleServer(recorded, running)` compares
**version strings** and returns `current` when they match, so a rebuilt dist at
the same version reads as up to date. The settings file records `engine` and
`script` but no build identity, so there is nothing else to compare.

The bill, in one session: a fix was verified by `curl` and reported as **failing
twice** while the old engine answered — a 404 on a page the new code serves, and
an index regression that had already been fixed. Both readings were confidently
wrong. It also produced the restarts that minted five fresh tokens and left a
reader pressing verdicts on dead pages, which took a whole spec
(`feat-one-review-link`) to undo.

## Decisions

1. **Compare the build, not only the version.** Record the engine script's mtime
   in the settings file at spawn, and compare it on adoption. Rejected hashing
   the engine's sources: the dist is assembled from several files, so a hash
   needs a manifest to stay honest, and mtime answers the only question here —
   *is the code on disk newer than the process serving it?*
2. **Rejected reading the process start time.** `ps -o lstart=` is
   platform-specific and needs parsing; the mtime recorded at spawn is the same
   fact, written by us, in the file we already write.
3. **A stale build restarts, exactly as a stale version does.** Two staleness
   signals, one behaviour — and it is safe now only because
   `feat-one-review-link` made the token outlive the process, so a restart
   preserves the URL. Before that spec this decision would have broken a link to
   fix a diagnosis, which is the trade that wasted a session.
4. **It speaks only when there is something to know.** Silence when the
   answering engine matches the code on disk — a line on every render is the
   narration `.claude/rules/spec-reports.md` forbids, and a line that is almost
   always identical is one people learn to skip, which is how the misleading
   `also:` addresses became invisible.
5. **Cannot-tell adopts.** A settings file written before this exists has no
   recorded mtime, and an unreadable script has none to compare — both are
   `unknown`, and `unknown` adopts in silence
   (`.claude/rules/negative-checks.md` rule 4). Restarting a healthy server over
   an absent field is the destructive reading.
6. **Not dogfooding-only.** Rejected gating this on "is this repo skitterspec" —
   a user who reinstalls the same version gets a new mtime and the same stale
   process, and an `am I my own repo` check is the special case that rots.

## Solution overview

`ensureReviewServer` records `scriptMtime` alongside `engine` when it spawns.
On adoption it compares the recorded mtime against the script's current one and
folds the answer into the existing staleness verdict: `stale` restarts and says
which engine was replaced, `current` and `unknown` adopt in silence. Everything
downstream — the replacement message, the token reuse, the URL — is unchanged.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `scriptMtime` in `.spec-env/review-serve.json` |
| Business rule | update | `staleServer` compares build identity as well as version |
| CLI command | update | `spec-env review` reports a replaced engine it already had wording for |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The daemon knows its build is old | ⬜ | [01-stale-by-build.md](01-stale-by-build.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-17 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-17 — Spec created. Raised after two wrong diagnoses in one session, both
  from curl'ing a page served by the last dist build while the source was fixed.
  Deliberately written after `feat-one-review-link` landed: restarting the daemon
  is only a safe response once the token survives it.
