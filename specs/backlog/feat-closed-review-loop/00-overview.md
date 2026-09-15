---
linear_identifier: "SKS-261"
linear_url: "https://linear.app/skitterbyte/issue/SKS-261/closed-review-loop-review-before-commit-like-a-local-pr"
---

# Closed review loop — review-before-commit, like a local PR

> **Type:** Feature
> **Name:** feat-closed-review-loop
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
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
| CLI command | update | `spec-env review <spec> --artifact` (db-backed page variant) |
| Config key | add | `review.required` in `env.config.json` (default `true`) |
| Engine state | add | gate record + outcome log beside `.pending.json` in `.spec-env/reviews/` |
| Hook | add | `PreToolUse` on `git commit`, installed by `spec-init` into project settings |
| Skill/rule | update | `spec-next` (arm + wait + refusal), `spec-diff` (wait mode, artifact publish, db claim), `spec-reviewed` (fallback framing, db claim), `spec-init` (hook install) |
| Skill/rule | update | `spec-planning.md`, CLAUDE.md review paragraphs — invariant rewritten, gate documented |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Gate engine — record, verbs, skip | ⬜ | [01-gate-engine.md](01-gate-engine.md) |
| 2 | Skill wiring — arm, wait, auto-claim, doc sweep | ⬜ | [02-skill-wiring.md](02-skill-wiring.md) |
| 3 | Commit hook — install + stays-silent tests | ⬜ | [03-commit-hook.md](03-commit-hook.md) |
| 4 | Artifact page — db verdicts for off-LAN readers | ⬜ | [04-artifact-page.md](04-artifact-page.md) |

## Open questions

- [ ] Artifact storage limits in practice: the page cap is 16MB per render and
      same-URL redeploy replaces versions — verify nothing else accumulates
      (old versions, db rows) across long specs during phase 4.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-15 — Spec created.
