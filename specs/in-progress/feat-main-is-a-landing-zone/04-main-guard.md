---
linear_issue_id: "SKS-343"
---

# Phase 4 — The main guard: engine verb, hook, `/allow-main` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** an `Edit`/`Write` in the primary checkout while it sits on the base
branch is refused by the harness, naming the two exits — and every cannot-tell
allows it in silence.

## Tasks

- [ ] Add `spec-env main <check|allow|status>` to `packages/common/src/cli.js`,
      in a new `packages/common/src/env/mainguard.js`:
      - `check --dir <cwd> [--session <id>]` — exit 1 **only** on the positive
        signal, printing the refusal on stdout; exit 0 otherwise.
      - `allow [reason] [--session <id>] [--off]` — record or clear an allow in
        gitignored `.spec-env/`.
      - `status [--json]` — what is in force, and why.
- [ ] Write the positive signal as one function, and comment the blind spots beside
      it per `.claude/rules/negative-checks.md`. All four must hold: isolation is
      configured (`env.config.json` present), `guards.mainIsLandingZone` is not
      `false`, `--dir` resolves to the **primary checkout** (not a worktree), and
      `resolve.js`'s `{ onBase }` is true. Anything unresolvable is a cannot-tell
      and allows.
- [ ] Add `guards.mainIsLandingZone` to `config.js`, defaulting to `true` when
      isolation is configured. Document the upgrade effect where the key is
      defined: existing projects gain the guard on update, and the refusal is what
      tells them so.
- [ ] Write `packages/common/assets/hooks/main-guard.cjs`, modelled on
      `review-gate.cjs` — same stdin shim, same `findEngine` walk, same
      `permissionDecision: 'deny'` JSON route so the reason reaches Claude, same
      fail-open on `result.error`, `status === null` and anything but exit 1.
      Matcher `Edit|Write|NotebookEdit`; pass `payload.cwd` and
      `payload.session_id`. It decides nothing itself.
- [ ] Word the refusal so it carries both exits and never reads as breakage:
      *"the primary checkout is on `main`, and `main` is a landing zone. Move the
      work: `/no-spec <name>` for a one-off, `/spec-start <name>` for a spec. If
      you mean it, the user can type `/allow-main`."* Name `/allow-main` as
      **the user's** command, since Claude cannot run it.
- [ ] Generalise `ensureReviewGateHook` in `packages/common/src/env/hooks.js` to
      register N hooks — each with its own script, matcher and timeout — keeping
      every property it already earned: preserve unknown keys, leave a malformed
      settings file untouched, match on the **script path** so an operator's
      wrapped invocation is migrated in place rather than duplicated, and stay
      idempotent. Rename the export accordingly and update `init.js`'s caller.
- [ ] Add `packages/common/assets/commands/allow-main.md` — a **command**, not a
      skill, `disable-model-invocation: true`, following the `/spec-remote-review`
      pattern of pre-executing one verb and relaying it. `/allow-main [reason]`
      allows; `/allow-main off` clears.
- [ ] Session-scope the allow with `CLAUDE_CODE_SESSION_ID`, which the hook payload
      also carries as `session_id`. With no session id, degrade to a repo-wide
      toggle cleared by `/allow-main off`, and have `main status` say which kind is
      in force — an allow that outlives its session must never look like one that
      does not.
- [ ] Document it in `.claude/rules/spec-planning.md`: `/allow-main` in the
      commands paragraph beside `/spec-connect`, `/spec-live` and
      `/spec-remote-review`, with the reason it is user-only stated plainly —
      a guard the model can lift is decoration.
- [ ] Tests: the positive signal fires on the primary checkout on base; the hook
      emits the deny JSON with both exits named; an allow suppresses it and
      `--off` restores it; a session-scoped allow does not apply to another
      session id.
- [ ] Tests (stays-silent, one per blind spot): a worktree on a spec branch; the
      primary checkout on a spec branch; a repo with no `env.config.json`; a
      non-git directory; `guards.mainIsLandingZone: false`; a missing engine; an
      engine that times out; a crash in the hook itself. Every one allows the
      write and prints nothing.
- [ ] Run `pnpm typecheck` and `pnpm test` — green before this phase is done.

## Notes

**Ships last, and that is a safety property.** Until `/no-spec` exists the guard
has nowhere to send anyone, and a guard with no exit gets switched off wholesale
rather than answered — which is the failure `review-gate.cjs`'s own header
records.

**The asymmetry with phase 3 is the design.** `/no-spec` is model-invocable so
Claude can move work *off* `main` on its own; `/allow-main` is user-only so it
cannot lift the guard. That is the same line `/spec-reviewed` draws, and
`spec-planning.md` already notes prose alone failed to hold it once.

`git` is untouched by this matcher, so `spec-env integrate`'s
`merge --ff-only` into the primary checkout still writes files on `main` exactly
as it must — landing is not editing.
