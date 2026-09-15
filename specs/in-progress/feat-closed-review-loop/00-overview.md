---
linear_identifier: "SKS-261"
linear_url: "https://linear.app/skitterbyte/issue/SKS-261/closed-review-loop-review-before-commit-like-a-local-pr"
---

# Closed review loop — review-before-commit, like a local PR

> **Type:** Feature
> **Name:** feat-closed-review-loop
> **Status:** In Progress — Phase 1 (started 2026-09-15)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** packages/common/src/env/review.js, packages/common/src/env/serve.js, packages/common/src/cli.js, packages/common/src/init.js, packages/common/assets/skills/{spec-next,spec-diff,spec-reviewed,spec-init}, packages/common/assets/rules/spec-planning.md
> **Stack:** worktree

## Problem

The review flow leaks at three joints. The phase-end review offer is a
non-blocking table row, so chained runs (`/commit && /spec-next`) skip it
entirely. The verdict button and the continuation are connected only by the
user remembering to type `/spec-reviewed` — the pass sits in `.pending.json`
until then. And nothing gates on any of it: `git commit`, `/commit` and
`/spec-next` all proceed with a review un-verdicted, so every path past the
review is a bypass. The intended shape is a local PR: a phase's exit runs
through a verdict, the verdict button itself resumes the agent, and the page is
readable from a phone — including off-LAN under remote control, where the
served LAN URL is unreachable and publishing today depends on remembering to
clear down.

## Decisions

1. **The gate is on by default.** Any project with isolation configured
   (`env.config.json` present) gets it; `review.required: false` opts out.
   Rejected: opt-in — the whole point is that the push is the default and
   escaping is the deliberate act.
2. **Gate semantics.** The gate **arms** when a phase ends (the phase-end
   render/serve in `/spec-next` records it, keyed to spec + tree state). It
   **disarms** only on a claimed *committing* verdict (the handler commits) or
   a recorded skip. A `changes` verdict leaves it armed: the work happens, the
   page re-renders, and the next verdict is the exit. Mid-phase `/spec-diff`
   renders never arm it — reviewing early must not create an obligation.
3. **Two-layer enforcement.** Skill-level: `/spec-next` §2 refuses to build on
   an armed gate; `/spec-diff` owns the loop. Harness-level: `spec-init`
   installs a `PreToolUse` hook that blocks `git commit` inside a spec worktree
   whose gate is armed. skittership's `/commit` is **never edited** — the hook
   is what covers it, which keeps the package boundary clean.
4. **Escape hatch is a recorded skip.** `skitterspec spec-env review skip
   "<reason>"` disarms the gate and writes the reason into the review outcome
   log. Same philosophy as gating's `none: <reason>`: allowed, on the record,
   never silent. Rejected: verdict-only (breeds resentment then config-off) and
   config-only (all-or-nothing).
5. **The page may now reach the session — deliberately.** This inverts the
   documented invariant ("a device that reaches your page cannot reach your
   conversation"). After serving, the skill sets a harness file-watch (Monitor)
   on the spec's `.pending.json`; a POSTed pass wakes the session, which
   auto-claims **only a pass whose render was minted during the current wait
   window, for that spec**, and routes on its verdict. The serve token
   (48-bit random path) is the credential; `/spec-reviewed` stays as the
   fallback and the two-passes disambiguation path. The docs that state the
   old invariant are updated in the same phase, not left contradicting the
   code — a premise shift reviews the whole design, not the narrow question.
6. **The hook obeys `negative-checks.md`.** Blocking a commit is an accusation.
   Positive signal: an armed-gate record present and parseable for this
   worktree. Cannot-tell (engine missing, unreadable state, not a spec
   worktree) → **allow**. Stays-silent tests are mandatory.
7. **Artifact page for off-LAN phones.** A `--artifact` render variant wires
   the verdict buttons to the artifact database (db + user capabilities)
   instead of a POST. Claude publishes it; **same-URL redeploy** is what
   removes the clear-down burden (one artifact per spec, replaced each
   render). No push exists from artifact db to the session, so the phone flow
   is: tap verdict → type `/spec-reviewed` in the same remote-control screen —
   the claim reads the db row and deletes it (consumed). A PushNotification
   announces the page when it's published.
8. **The phase-end question is replaced by the wait.** `/spec-next` ends its
   turn "watching for your verdict" instead of asking a question that a
   chained run scrolls past. The continuation *is* the verdict. Where the
   harness has no Monitor, today's Review row + `/spec-reviewed` remains and
   the gate still holds.

## Solution overview

The engine grows a gate record beside the pending store (gitignored,
per-spec): armed-at, tree state, and an outcome log of verdicts and skips.
`spec-env review gate [<spec>] [--check] [--json]` reports it (`--check` exits
non-zero when armed — the hook's one call); `spec-env review skip "<reason>"`
disarms on the record. `/spec-next` arms it at phase end, serves, starts the
watch, and ends the turn. The verdict POST lands, the watch fires, the session
claims the wait-window's pass and routes: `Commit` → commit skill; `Commit &
Continue` → commit, then next phase; `changes` → work them (gate stays armed);
`discuss` → ask. `/spec-diff` gains the same wait mode for anytime use.
`spec-init` installs the PreToolUse hook. The artifact variant renders the same
page with db-backed verdict buttons for readers no local server can reach.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env review gate [--check] [--json]`, `spec-env review skip "<reason>"` |
| CLI command | update | `spec-env review <spec> --claim-since <iso>` (claim the pass from a wait window), `--artifact` (db-backed page variant) |
| Config key | add | `review.required` in `env.config.json` (default `true`) |
| Engine state | add | gate record + outcome log beside `.pending.json` in `.spec-env/reviews/` |
| Hook | add | `.claude/hooks/review-gate.js`, registered as a `PreToolUse` Bash hook in the project's committed `.claude/settings.json` |
| Engine | add | `src/env/commitcmd.js` (is this a `git commit`?), `src/env/hooks.js` (settings registration) |
| Skill/rule | update | `spec-next` (arm + wait + refusal), `spec-diff` (wait mode, artifact publish, db claim), `spec-reviewed` (fallback framing, db claim), `spec-init` (hook install) |
| Skill/rule | update | `spec-planning.md`, CLAUDE.md review paragraphs — invariant rewritten, gate documented |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Gate engine — record, verbs, skip | ✅ | [01-gate-engine.md](01-gate-engine.md) |
| 2 | Skill wiring — arm, wait, auto-claim, doc sweep | ✅ | [02-skill-wiring.md](02-skill-wiring.md) |
| 3 | Commit hook — install + stays-silent tests | ✅ | [03-commit-hook.md](03-commit-hook.md) |
| 4 | Artifact page — db verdicts for off-LAN readers | ✅ | [04-artifact-page.md](04-artifact-page.md) |
| 5 | The endings people actually see | ✅ | [05-review-ux.md](05-review-ux.md) |

## Open questions

- [x] **Answered in phase 4.** Nothing accumulates that needs clearing down.
      The page is republished to the **same file path**, so every render
      reuses one URL — one artifact per spec, not one per phase, and the
      gallery gains a single entry however long the spec runs. Versions are
      kept under that URL rather than as separate artifacts. The store caps at
      5,000 documents per artifact and 256 KiB per document, and a pass is
      **deleted when it is claimed**, so the `passes` collection is bounded by
      how many reviews are outstanding at once — never by how many the spec
      had. What remains true is the original caveat: skitterspec cannot delete
      a published page, so it is still yours to remove.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | Ready | backlog | Reuben Greaves |
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-15 — Spec created.
- 2026-09-15 — Phase 1: the skip log lives in the gate record's own `log`, not
  the notes `decisions` log. The page maps unrecognised verdicts to
  "discussed", so a `skip` logged there would render as a lie; showing the gate
  log on the page moved to phase 2.
- 2026-09-15 — Phase 5: the banner offers exactly one link. Caveating the
  published link was the wrong fix for the previous entry — the caveat existing
  at all is the bug, because the reader cannot tell which door the run is
  standing behind. The engine's `reader:` line already decides, so the skill
  relays that page and publishes only where it could not serve.
- 2026-09-15 — Phase 5: the wait was promised for a transport it cannot see.
  The watch reads the engine's local pending store; the published page writes
  to the artifact store, which nothing pushes from. Offering both links under
  "I'm holding here" meant three verdicts were pressed and none noticed. The
  contract and both skills now require the published link to say that
  `/spec-reviewed` is what picks it up.
- 2026-09-15 — Phase 5: hiding an element in JavaScript did nothing where its
  class set a `display`, because that beats `[hidden]`. `.sent-cmd` was the
  visible failure; a stylesheet-reading guard found `.reviewable` too. The DOM
  shim has no CSS, so no behavioural test could have caught either.
- 2026-09-15 — Phase 5: the copy control is now conditional on there being a
  code. Carrying the hand-off onto the decided panel was right, but rendering a
  bare `/spec-reviewed` as an input plus a Copy button dressed a word you type
  into the terminal you are already in as an artefact to transport — and left
  the ending looking unfinished. It is a clause in the panel now.
- 2026-09-15 — Phase 5: `Snags` renamed to `Notes` in the report contract and
  every skill that declares it.
- 2026-09-15 — Phase 5 added after using the loop for real. Three things the
  build got wrong in practice: the report kept growing prose after the table
  (twice in one message), so the review offer is promoted out of the table into
  a designed banner and the contract gains its second permitted control; the
  page left a "Sent. Run this…" line under live buttons after a verdict, where
  it should end the review and say what was decided; and the `WHY` block reads
  as blocky and oversized.
- 2026-09-15 — Phase 4: no `--artifact` render variant was added. The page
  feature-detects `window.claude.use` instead, so one render serves all three
  transports and a published page cannot be the wrong build. `user` was not
  declared either — it is not available on this contract, and a shared
  `passes` collection is what a review pass wants.
- 2026-09-15 — Follow-up surfaced: **the served page cannot show page changes
  made on a branch.** The review daemon runs the primary checkout's installed
  copy by design (so it outlives the worktree it serves), and that copy is the
  base branch — so a phase that edits `assets/review/page.html` renders its own
  changes into the *file* and the *published* copy, while the LAN URL keeps
  serving the old template. Nothing warns about it, and the diff shown on the
  stale page contains the very markup that is missing from it. Not in scope
  here; the file render and the published page are both correct meanwhile.
- 2026-09-15 — Follow-up surfaced: the serve token is minted per server, so
  every URL printed in an earlier report dies silently when the server
  restarts — a stale token is `notfound`, which is right as a guard but reads
  to the operator as a broken page rather than a stale link. It cost a
  phase-end review here: the link in the report 404'd on the Mac and the phone,
  and looked like the page was down. Not in scope for this spec.
- 2026-09-15 — Phase 3: the hook refuses only when the commit runs inside that
  spec's own worktree. The first version denied commits in the primary checkout
  whenever any spec was mid-review, because the engine's bare resolution
  answers with the sole provisioned spec wherever you stand — which would have
  blocked authoring a backlog spec from `main`. Caught by a stays-silent test.
- 2026-09-15 — Phase 3: `spec-env review gate --for-command <cmdline>` added so
  the hook asks one question and holds no judgement of its own; the "is this a
  git commit" reading lives in `src/env/commitcmd.js` and is unit tested.
- 2026-09-15 — Phase 2: the wait window became an engine flag
  (`spec-env review --claim-since <iso>`) rather than a rule the skill follows.
  A skill told to claim "the pass from this wait" has to read the store and
  choose, which turns the never-choose rule into a request; the engine answers
  in three states and acts only on exactly one pass.
- 2026-09-15 — Phase 2: the served page now reads the notes sidecar and the
  gate. It never read either, so accepts vanished on every refresh there and no
  history line could appear — leaving the gate undisplayable on the one surface
  a phone can reach. Read-only, and `serve.js`'s header comment corrected.
- 2026-09-15 — Phase 2: the prose guards that pinned "a device that reaches
  your page cannot reach your conversation" now pin what replaced it (the serve
  token, the wait window, and `/spec-reviewed` being untypeable by the model).
  The guards were kept and re-aimed rather than deleted.
- 2026-09-15 — Phase 1: no tree state is recorded at arming, against the plan.
  A gate that lapsed when the tree changed would be cleared by the act of
  carrying on working, which is the bypass it exists to close. It clears on a
  decision or not at all.
