---
linear_identifier: "SKS-293"
linear_url: "https://linear.app/skitterbyte/issue/SKS-293/the-review-link-keeps-working-and-says-so-when-it-cannot"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The review link keeps working — and says so when it cannot

> **Type:** Feature
> **Name:** feat-the-review-link-keeps-working (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-16)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** `packages/common/src/env/config.js`, `packages/common/src/cli.js`, `packages/common/assets/review/page.html`, `specs/.core/env.config.md`
> **Stack:** worktree

## Problem

`review.servePort` defaults to **`7777` for every repo**, so two repos on one
machine want the same port. The second is refused —
`port 7777 is already in use — pass --port, or --stop if this is an older
server` — and whoever hit it passes `--port 7778` and moves on.

That works for the person starting the server and breaks the person **reading**.
The link they were handed names `7777`, and `7777` is now a different repo's
daemon: the token means nothing there, the POST comes back `404`, and the
verdict goes nowhere. Observed on this machine — an `ereqs` daemon holding
`7777` while skitterspec's sat on `7778`.

And the reader is told about it in a small grey line in the page footer,
`Not sent — not found`, beneath a verdict bar that has just closed. The one
outcome they **must** act on is reported more quietly than the success it is
not.

The port is the acute cause but not the only one. A link goes stale three ways:
the port moves (this spec), the engine is replaced (already handled — the token
is carried across an in-place replacement), and the server is deliberately
stopped and restarted (a fresh token, by design — see decision 4).

## Decisions

1. **The default port is derived from the repo, not shared by every repo.**
   `servePort: "auto"` — the new default — hashes the repo's resolved path into
   a declared range, so two repos do not collide without anyone configuring
   anything, and the **same repo gets the same port every time**. Stability is
   the point: a port that is merely *free* is not a port a link handed out
   yesterday can still resolve. An explicit number still wins, exactly as now.

2. **Rejected: walk upward to the next free port.** It removes the refusal and
   keeps the staleness — the port then depends on which repo started first, so
   the same repo lands somewhere different tomorrow and every link handed out is
   provisional. The refusal is not the problem; the shared default is.

3. **A derived port can still collide**, and it must still refuse rather than
   pretend. A hundred slots and a handful of repos is a small chance, not no
   chance, and the honest answer to a hash collision is the refusal that already
   exists — improved to name `servePort` as the durable fix rather than only
   `--port`, which moves you aside and breaks your links again.

4. **A deliberate `--stop` still re-mints the token.** The token is the only
   guard on a non-loopback bind, and a credential that outlives an explicit
   "I am done with this server" is worse than a link that has to be re-opened.
   In-place replacement keeps carrying the token, as it already does, because
   there the operator never asked for anything to end.

5. **A failed send gets the callout, not the footer.** The same box the
   unclaimed-pass case uses, in the delete palette rather than the add one. It
   names what came back, what that most likely means, and offers the verdict
   command — which reaches the agent regardless of any server, and is exactly
   why a recovery path can be offered here at all.

6. **`404` and `422` are different sentences.** A `404` means *this page's server
   is not there any more* — re-open the page. A `422` means the engine read the
   pass and refused it, and its message names what was wrong. Collapsing them
   sends the reader to re-open a page that would refuse them again.

## Solution overview

**A port per repo.** `review.servePort` gains a string form:

```jsonc
// specs/.core/env.config.json
"review": { "servePort": "auto" }   // the default; or a number to pin it
```

`auto` resolves to `PORT_BASE + hash(realpath(repoRoot)) % PORT_SPAN` — a pure
function of the path, so it is the same on every run and needs no state on disk.
`spec-env review serve --status` prints which it resolved and why, so a reader
asking *"why is this on 7742?"* gets an answer from the tool.

**A loud failure.** The page's send path already distinguishes a refusal
(`!res.ok`) from a network failure; both currently land in `copy-hint`. They move
into the decided panel's callout, styled from `--del-bg` / `--del-fg` /
`--del-mark`, carrying the reason and the `/spec-reviewed <verdict>` escape
hatch that phase 2 of `feat-no-pass-waits-unheard`'s predecessor shipped.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `review.servePort` — accepts `"auto"` (new default) as well as a number |
| CLI command | update | `spec-env review serve --status` reports the resolved port and how; the busy refusal names `servePort` |
| Page | update | a failed send moves to the decided callout, in the delete palette, with the verdict command |
| Docs | update | `specs/.core/env.config.md` — the `servePort` section |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | A port per repo, stable across restarts | ✅ | [01-a-port-per-repo.md](01-a-port-per-repo.md) |
| 2 | A failed send is as loud as a successful one | ⬜ | [02-a-failed-send-is-loud.md](02-a-failed-send-is-loud.md) |

## Open questions

- [ ] None.

## Changelog

- 2026-09-16 — Phase 1: `servePort` refuses an unrecognised value by falling
  through to the default, rather than throwing at config-load. That matches
  `reader`, `mode` and `deleteRemoteBranch`, and it costs nothing here: the only
  value a typo can fall through to is `"auto"`, which is also the only string
  that would have been accepted — so a misspelt `"auto"` behaves identically to
  the spelling that was meant, and a misspelt number was never a number. There
  is no reading of the key where silence hides a port the author pinned.
- 2026-09-16 — Phase 1: the resolved port's **source** is written into
  `.spec-env/review-serve.json` as `portSource`, not recomputed at `--status`
  time. A server adopted across an upgrade has no recorded source, and the
  status line then carries the port alone — a recomputed answer could disagree
  with the port actually being served.
- 2026-09-16 — Spec created. Split out of `feat-no-pass-waits-unheard`, which
  found this while diagnosing a different cause of the same symptom: both make a
  reader press a verdict and see nothing happen, but a watcher that never fires
  and a link that points at the wrong daemon want different fixes.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |
| 2026-09-16 | In Progress | in-progress | Reuben Greaves |
