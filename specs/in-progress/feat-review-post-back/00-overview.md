---
linear_identifier: "SKS-217"
linear_url: "https://linear.app/skitterbyte/issue/SKS-217/the-page-posts-its-pass-back-claimed-by-a-code"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The page posts its pass back, claimed by a code

> **Type:** Feature
> **Name:** feat-review-post-back (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-14)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/src/env/serve.js, packages/common/src/env/review.js, packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec-diff, packages/common/assets/core/env.config.md, packages/common/test
> **Stack:** worktree

## Problem

`feat-review-verdict` made the page end in a decision, but the decision still
travels by clipboard: you press a verdict, the page copies a JSON blob, and you
paste it into the chat. On a phone — the case the whole served-page design
exists for — that is copy, app-switch, paste, on a blob that grows with the
review.

The cost is not only the gesture. **The blob passes through the model**, so a
marked-up 60-file review spends context proportional to how much you wrote. That
is the one place the feature breaks its own rule: git writes the diff, the engine
splices it, and the model never reads it — until the pass comes back, when
suddenly it does.

The server could take it directly. It is already running, already reachable from
the phone, already holds the token. It just cannot be written to: the request
handler (`serve.js`) never inspects `req.method`, so every request renders HTML.

## Decisions

1. **The code gates Claude's consumption, not the endpoint.** A code checked by
   the HTTP handler buys nothing — it is printed on the page, so anyone who can
   read the page can send it, which is the trust the URL token already grants.
   Checked at the point Claude *applies* the pass, it does real work: it proves a
   person was sitting there, and it says **which** pass when more than one could
   be in flight. Rejected: gating the endpoint (theatre); gating both (the first
   check still theatre, one more thing to keep in step).
2. **A POST lands as `pending` and changes nothing.** The sidecar is only written
   when a code is claimed. So the write path the LAN gains is a path to a
   **holding area**, and the thing that reaches the repo still passes through a
   person.
3. **A wrong or missing code refuses, and never falls back.** No "apply the most
   recent pending pass", no "there is only one, so it must be that one"
   (`.claude/rules/negative-checks.md` rule 4 — the unknown case routes to
   inaction). A refusal lists nothing either: naming the pending passes would
   hand a guesser the answer.
4. **Pending passes live on disk, beside the sidecar.** Not in server memory —
   `feat-review-serve-version` restarts the server automatically when the engine
   moves under it, and a restart that drops the pass you just sent would be a new
   way to lose work. On-disk also means `--claim` needs no running server.
5. **A code is consumed, and superseded — never expired on a timer.** Claiming
   spends it. Sending a second pass from the same page render supersedes the
   first unclaimed one, so the code on screen is always the pass on screen. No
   clock: a pass that silently evaporates while you are reading is worse than one
   that waits.
6. **The code is unique among pending, not secret.** It is on the screen by
   design. What it must not do is collide: two pending passes sharing a code is
   how the wrong one gets applied. Mint against the pending set, do not draw and
   hope.
7. **The paste stays, and stays unmarked.** `file://` has no server to talk to,
   and a page on disk cannot write to disk (the File System Access API is
   Chrome-only, needs a gesture and a grant, and is absent on iOS Safari). The
   blob textarea is the fallback and is not deprecated — it is the whole story
   for a local reader, where the friction was always lowest.
8. **The endpoint is the page's own URL.** `POST` to the same path that served
   it, so the page needs no second address, no config, and works unchanged behind
   whatever host the server was told to bind.

## Solution overview

```
  page  ──POST /<token>/<spec>──▶  server validates, writes
                                   .spec-env/reviews/<spec>.pending.json
        ◀── 200 { code: "418207" }
  page shows:  sent · claim it with 418207

  you   ──"418207"──▶  Claude
                       skitterspec spec-env review <spec> --claim 418207
                       ▶ merges that pass into <spec>.notes.json, re-renders
                       ▶ the code is spent

  wrong code ▶ refuses · writes nothing · names nothing
```

The POST body is the same blob the Copy button produces and the same
`validateNotesBlob` rejects — one shape, one validator, whichever way it arrived.
A blob that fails validation is refused at the POST with the engine's own
message, so a bad pass is reported on the page rather than discovered later.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| HTTP | add | `POST /<token>/<spec>` — accepts a blob, returns a code |
| Engine | add | `readPending` / `writePending` / `claimPending` (pure + IO split) |
| Sidecar | add | `.spec-env/reviews/<spec>.pending.json` (gitignored, like the rest) |
| CLI | add | `spec-env review <spec> --claim <code>` |
| CLI output | update | render says when passes are pending, and how many |
| Page | update | verdict buttons POST when served; fall back to the clipboard on `file://` |
| Skill | update | `/spec-diff` §2 gains the claim path ahead of the paste path |
| Rule/docs | update | `spec-planning.md`, the CLAUDE.md section, `env.config.md`, the docs site |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The pending store and the claim | ✅ | [01-pending-store.md](01-pending-store.md) |
| 2 | The server accepts a POST | ✅ | [02-post-endpoint.md](02-post-endpoint.md) |
| 3 | The page sends, and falls back | ⬜ | [03-page-sends.md](03-page-sends.md) |
| 4 | The skill claims, and the docs | ⬜ | [04-claim-and-docs.md](04-claim-and-docs.md) |

## Non-goals

- **Notifying Claude.** Nothing pushes; you say the code. A server that could
  reach into the session is a much larger thing than this, and the code is the
  handshake that makes it unnecessary.
- **Replacing the paste.** Decision 7. The clipboard path is the `file://` story
  and it keeps working exactly as it does now.
- **Authenticating who sent it.** The code says *a* person with the page meant
  this pass. It does not say which person, and this ships no reviewer identity —
  the same non-goal `feat-review-verdict` recorded.
- **Writing anything but review state.** The endpoint accepts a review pass and
  nothing else. It is not a general write path into the repo, and must never grow
  into one.

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-14 | Ready | backlog | Reuben Greaves |
| 2026-09-14 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-14 — Phase 2: the render key comes from the blob's own `generatedAt`
  rather than a field of its own. The page already mints that per render and
  already sends it, so a second key would be a second thing to keep in step for
  no gain. A blob without one never supersedes anything, which is the harmless
  direction: an extra pass waiting, never a pass silently replaced.
- 2026-09-14 — Phase 2: the body cap is enforced **per chunk**, not on the
  finished body. A cap applied after the fact has already done the thing it was
  meant to prevent.
- 2026-09-14 — Phase 1: the blob is validated **on the way out as well as on
  the way in**. Decision 2 has a POST validate before it stores, but a pass has
  then been through a socket and sat on disk, so it is untrusted input twice
  over — and phase 2's endpoint does not exist yet, which means nothing would
  have validated a hand-written store at all. `--claim` runs the real
  `validateNotesBlob` and refuses without merging.
- 2026-09-14 — Phase 1: `feat-review-serve-version` left a deliberate tripwire —
  a test asserting the pending-store constraint was merely written down, which
  failed the moment a pending store appeared. It fired on this phase's first
  full run and has been replaced with the real thing: a pass is held, the
  restart's only on-disk effect is applied, and the pass still claims
  afterwards. That is the cross-spec constraint discharged rather than restated.
- 2026-09-14 — Spec created, out of using `feat-review-verdict` on a phone. The
  prompt was "is the paste just the best we can do" — and for a served page it is
  not, because the server that renders it is already running and already
  reachable. The pass code came from the operator, and survived the grilling in a
  different position than it started: gating the endpoint would have been the
  URL token with extra steps, and gating the *claim* is what makes it worth
  having.
