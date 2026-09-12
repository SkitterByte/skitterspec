---
linear_identifier: "SKS-185"
linear_url: "https://linear.app/skitterbyte/issue/SKS-185/get-the-diff-in-front-of-the-reader-wherever-they-are"
---

# Get the diff in front of the reader, wherever they are

> **Type:** Feature
> **Name:** feat-diff-reaches-the-reader (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-12
> **Area:** packages/common/src/env/{review,serve,teardown,config}.js, packages/common/src/cli.js, packages/common/assets/skills/{spec-diff,spec-next,spec-bug,spec-hotfix}/SKILL.md, packages/common/assets/core/env.config.md
> **Stack:** worktree

## Problem

`/spec-diff` renders a page and hands over a `file://` URL. That URL is useless
to a reader who is not sitting at the machine that wrote it — which is the common
case, not the edge: the operator reads on a phone, through a bridged session, and
the link is dead on arrival. The workaround is publishing to an artifact, and
that has two costs of its own.

**Publishing takes a hand transform.** The engine writes a complete HTML document
(`<!doctype html>` … `</html>`) and the artifact host wraps page *content* in its
own skeleton, so publishing as-written nests two documents. Getting it published
means splitting `<title>` + `<style>` + body out of the document by hand, every
time. It was done by hand three times on `feat-review-offer-lands` alone.
`/spec-diff` §6 documents how to record the returned URL but assumes the page is
publishable as it stands.

**And publishing cannot be undone by this tooling.** `/spec-diff` says so
already, but nothing acts on it: `spec-env down` knows nothing about
`.spec-env/reviews/`, so a torn-down spec leaves a live public page and a `.url`
file pointing at it, with no report that either exists. After
`feat-review-offer-lands` completed, its worktree, branch and Linear assignment
were all reclaimed while its published page stayed up — the only survivor nobody
mentioned.

Underneath both: the tooling has no idea **where the reader is**, so it cannot
choose the right answer. It always gives the local one.

## Decisions

1. **Serve the page from a small local server, and make that the default way to
   read a diff.** `spec-env review serve` renders through `collectReview` +
   `renderReviewPage` **in memory, per request** — so it owns the response
   wrapper (no unwrap), is never stale (no snapshot to overwrite), leaves nothing
   to clean up, and can offer an index across every spec with a worktree, which
   no current path gives. `?branch=1` becomes a query parameter rather than a
   re-render.
2. **It is small because the machinery exists.** `proxy.js` already has
   `http.createServer`, `listen`, `portsInUse` and `checkListening` with zero
   dependencies; `supervise.js` already has `startProcess`/`stopProcess`,
   pidfiles and process-group signalling. The new code is routing, not
   infrastructure, and adds **no dependency** (the repo has none at runtime).
3. **Binding: `127.0.0.1` by default; `--host 0.0.0.0` opts in and mints a random
   path token**, printed as part of the LAN URL. An unguessable path is what stops
   a colleague on the same wifi reading every spec's diff by scanning ports.
   *This one is the implementer's call rather than the operator's* — it was
   recommended, not chosen, and may be overturned; the token is the part worth
   arguing about.
4. **Publishing stays, and gains `--publish-copy`.** The server does not replace
   publishing: a published page works when the laptop is asleep, on a train, next
   week, and away from the LAN. So the hand transform gets removed rather than
   made rare — `spec-env review <spec> --publish-copy` writes the body-only
   `<page>.publish.html` and prints its path. Rejected making it the *only* fix
   (the server is the better default) and rejected always writing both files (a
   second copy of every diff on disk, for a path most renders never take).
5. **Reader detection decides the offer's wording, never the act.** Three states —
   `local`, `remote`, `unknown` — and `unknown` routes to today's behaviour plus
   one line (`.claude/rules/negative-checks.md` rule 4). Guessing `local` prints a
   dead link, which is the bug being fixed; guessing `remote` would publish
   something uncleanable unprompted, which is worse. **Nothing publishes on a
   detection.**
6. **`review.reader` in `env.config.json` beats any sniffing**, because the
   operator knows where they are reading: `local | remote | detect`, defaulting to
   `detect`. Detection is the default, not the mechanism.
7. **Detection lives in the engine and is reported, not inferred by a skill.** The
   engine prints a `reader:` line (and a `--json` field) so all four skills get
   the same answer and it is testable. A skill sniffing environment variables
   cannot be tested and will drift.
8. **Signals, ranked, with the trap written down.** `SSH_CONNECTION`/`SSH_TTY`
   first — a standard convention, and set means the path is on a machine the
   reader is not looking at. `CLAUDE_CODE_BRIDGE_SESSION_ID` second: the best
   correlation to "this link will not open where you are", and undocumented
   harness internals that may change, so absence of it proves nothing.
   **`CLAUDE_CODE_ENTRYPOINT` is not used** — it describes the *process*, not the
   reader, and reported `cli` for the bridged session that started this spec,
   which is exactly the wrong answer. **A tty check is useless** — stdin is never
   a tty under Claude Code, so it discriminates nothing; written down because it
   is the obvious thing to reach for.
9. **Teardown reports the surviving page and deletes nothing.** `spec-env down`
   names the published URL, says this tooling cannot remove it, and says where it
   can be removed. It keeps the local page, notes and `.url`: deleting the `.url`
   would destroy the only record of what there is to delete. Rejected reaping the
   local files (loses the review record) and rejected making a published page a
   confirm-first condition on teardown (an unremovable side effect should not
   block a step that otherwise runs unattended).

## Solution overview

```
spec-env review serve [--port N] [--host 0.0.0.0] [--stop|--status]
  /                 index of every spec with a worktree
  /<spec>           the page, rendered per request
  /<spec>?branch=1  the whole-spec view
  /<token>/...      only when bound beyond loopback

spec-env review <spec> --publish-copy   → <page>.publish.html + its path
spec-env review <spec>                  → gains a `reader:` line
spec-env down <spec>                    → names a surviving published URL
```

The reader line is what the skills read, so one detection serves all four:

```
spec-env review: feat-x (uncommitted)
  8 files, +327 -15
  reader: remote (bridge session)
  open:   file:///…/feat-x.html   (will not open where you are reading)
  serve:  spec-env review serve
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env review serve` (`--port`, `--host`, `--stop`, `--status`) |
| CLI command | add | `spec-env review <spec> --publish-copy` |
| CLI command | update | `spec-env review` prints `reader:`; `--json` gains `reader` |
| CLI command | update | `spec-env down` reports a surviving published URL |
| Config key | add | `review.reader` — `local` · `remote` · `detect` (default `detect`) |
| Config key | add | `review.servePort` — default port for `serve` |
| Skill/rule | update | `/spec-diff` — serve first, §6 says where a published page is deleted |
| Skill/rule | update | `/spec-next`, `/spec-bug`, `/spec-hotfix` — offer wording follows `reader:` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Serve the page, rendered per request | ⬜ | [01-serve-the-page.md](01-serve-the-page.md) |
| 2 | `--publish-copy`, so publishing needs no hand transform | ⬜ | [02-publish-copy.md](02-publish-copy.md) |
| 3 | Reader detection — three states, reported not acted on | ⬜ | [03-reader-detection.md](03-reader-detection.md) |
| 4 | Account for what publishing leaves behind | ⬜ | [04-account-for-the-page.md](04-account-for-the-page.md) |
| 5 | Point the skills at the right answer | ⬜ | [05-skills-follow-the-reader.md](05-skills-follow-the-reader.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-12 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-12 — Spec created. Scope grew during grooming from two fixes (publish
  ergonomics, orphan accounting) to five phases: the operator asked how big a
  local server would be instead of taking the flag, and then asked for a better
  way to detect mobile/remote. Both became phases; the flag stayed as well,
  because the server does not cover reading away from the LAN.
- 2026-09-12 — Binding (decision 3) is the implementer's call, not the
  operator's: recommended and not rebutted, so recorded as a decision to
  overturn rather than an agreed one.
