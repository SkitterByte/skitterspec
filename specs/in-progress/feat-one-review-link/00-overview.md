---
linear_identifier: "SKS-314"
linear_url: "https://linear.app/skitterbyte/issue/SKS-314/one-review-link-valid-until-you-are-done-with-it"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# One review link, valid until you are done with it

> **Type:** Feature
> **Name:** feat-one-review-link (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-16)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** packages/common/src/cli.js, packages/common/src/env/serve.js, packages/common/src/env/review.js, packages/common/test/
> **Stack:** worktree

## Problem

A review link handed to a phone stops working, repeatedly, for reasons that have
nothing to do with the network. In one session five different URLs were handed
out for the same repo and the reader was left on a dead one twice.

Four distinct causes, all reproduced:

1. **The token is random per server; the port is derived per repo.** The port is
   `PORT_BASE + hash(realpath(repo)) % PORT_SPAN`, a pure function of the path,
   deliberately stable across a restart, a reboot and a `--stop` — that was the
   whole point of `feat-the-review-link-keeps-working`. The token beside it is
   `crypto.randomBytes(6)`, minted per process. So one half of the URL is built
   to survive and the other is built not to.
2. **`--stop` then start loses the token.** The engine *does* carry the old
   token when it **replaces** a server on the same bind — its comment reads
   *"KEEP THE URL. The operator is usually holding the old link on a phone"* —
   but a stop followed by a start has no settings left to read, so the one
   protection that exists never covers the commonest operation.
3. **A `--docs` page dies at its own commit.** It renders a spec's *uncommitted*
   documents, so honouring its verdict is what destroys it: press the button,
   the agent commits, and a reload 404s. A phase page survives the same moment
   through the clean-tree branch fallback; the docs view has no equivalent.
4. **The URL's shape depends on a guess that changes.** `token = loopback ? null
   : …`, and the bind comes from reader detection — which flipped from `unknown`
   to `remote` inside one session. So the same repo's URL gains and loses a path
   segment depending on what the engine last guessed about where you were
   sitting.

## Decisions

1. **The token becomes a per-repo secret, stored once.** Written to a gitignored
   file under `.spec-env/` on first use and reused by every server for that
   repo, so a restart cannot change the URL. Rejected **deriving it from the
   repo path** like the port: the path is guessable by anyone on the machine, and
   the token is the only guard on a non-loopback bind — a derived token would
   trade 48 bits of unguessability for stability we can have both ways.
2. **Stability is not a weakening.** It stays 48 random bits, minted once instead
   of per process, and it can be rotated on demand. What changes is that it
   outlives the process rather than the link outliving the token.
3. **Always carry a token, loopback included.** One URL shape, so detection
   flipping mid-session cannot change the address. The cost is a longer local
   URL; the benefit is that the link you were sent is the link that works.
4. **A docs page keeps answering after its commit** by falling back to what the
   spec now *is* — the committed documents at `HEAD` — rather than reporting
   nothing to review. That mirrors the phase page's clean-tree fallback, and for
   the same reason: the page is rendered before the commit and read after it.
5. **Rotation is explicit and says what it costs.** `review serve --rotate-token`
   mints a new one and states plainly that every link already handed out dies.
   Nothing else may mint silently — the silent mint is the whole bug.
6. **The engine, not the skills.** Every fix here is in the engine, so no skill
   has to remember anything and none of them can get it wrong differently.

## Solution overview

The serve token moves from a per-process mint to a per-repo secret read from
`.spec-env/` (created on first use, gitignored, rotatable). Every bind carries
it, so the URL shape is constant. The docs view gains a committed-documents
fallback so a page outlives the verdict that was pressed on it. A restart,
a `--stop`, a reboot and a detection flip all leave the URL unchanged.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env review serve --rotate-token` |
| CLI command | update | the served URL is stable across restart, stop and bind |
| Config key | add | `.spec-env/review-token` (gitignored, per repo) |
| Business rule | update | a `--docs` page falls back to `HEAD` after its commit |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The token outlives the process | ✅ | [01-a-token-per-repo.md](01-a-token-per-repo.md) |
| 2 | One URL shape, whatever the bind | ⬜ | [02-one-url-shape.md](02-one-url-shape.md) |
| 3 | A docs page outlives its verdict | ⬜ | [03-the-page-outlives-the-commit.md](03-the-page-outlives-the-commit.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |
| 2026-09-16 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-16 — Spec created after a fifth URL was handed out for one repo in a
  single session and the reader was left on a dead link twice. Three of the four
  causes were self-inflicted by restarting the server to pick up rebuilt code;
  the fourth is that the token and the port disagree about whether a URL should
  survive.
- 2026-09-16 — Evidence found at start: a server died on its own and the next
  render minted a fresh token, handing out a sixth URL for this repo in one
  session with nobody having restarted anything. So cause 2 is not only
  self-inflicted — any process death loses the link, which raises phase 1 from
  a tidiness fix to the one that matters.
- 2026-09-16 — Phase 1: the token is stored at `.spec-env/review-token`, read by
  every cold start, and changed only by `--rotate-token`, which states that every
  handed-out link dies. A pinned test asserting the old `mintToken()` literal was
  updated with its reasoning rewritten, since its premise — no link worth
  preserving on a cold start — stopped being true when the port became derived.
