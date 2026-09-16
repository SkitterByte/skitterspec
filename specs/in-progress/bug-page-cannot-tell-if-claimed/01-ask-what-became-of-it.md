---
linear_issue_id: "SKS-282"
---

# Phase 1 — The served page asks, and says what is true ✅

**Goal.** A page that sent its pass over the wire stops guessing whether anyone
picked it up. It asks the engine, and ends on one of two sentences: Claude has
it, or here is the command — the second one loud, in the You chose box, where a
reader who must act will see it.

## Tasks

- [x] `passState(outPath, spec, code)` in `packages/common/src/env/review.js`,
      pure enough to test without a repo. `waiting` when the code is in the
      pending store; `claimed` when the decision log names it; `unknown`
      otherwise — corrupt store, absent sidecar, a code that is not six digits
      (which never reaches disk at all).
- [x] `appendDecision` takes an optional `code` and writes it, `null` where
      there was none. The claim path in `cli.js` passes the code it consumed.
- [x] `createReviewServer({ passState })` answers `GET <spec>?pass=<code>` with
      `{state}` as JSON. `routeFor` grows the case; the index and a wrong token
      stay the same 404 they already are; no seam wired answers `unknown`.
- [x] Wire the real lookup where the daemon builds its server, so a served page
      gets a real answer rather than `unknown` forever.
- [x] The page polls `location.pathname + '?pass=' + code` after a successful
      POST — a bounded number of rounds, then it gives up and hands over the
      command. `claimed` → the decided note says Claude picked it up and no
      command appears. Every other answer → the command.
- [x] Move `#sent-cmd` (and its hint) into `#decided`, and give it an `act`
      class with a callout style — a border and a filled background in both
      themes, tokens defined on bare `:root`.
- [x] `drawDecided` replays the ending it recorded rather than re-deriving it,
      so a re-opened tab says what it said before.
- [x] Render the command as plain text (`<code>`, `user-select: all`) with a
      Copy control, never a readonly input; select it where the browser allows
      and say so only when it worked.
- [x] Tests green: `node --test packages/common/test/env-review-pass-state.test.js
      packages/common/test/env-serve-pass-state.test.js
      packages/common/test/assets-review.test.js`, then the full `node --test`.
