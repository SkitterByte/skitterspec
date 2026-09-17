---
linear_issue_id: "SKS-343"
---

# Phase 4 — The main guard: engine verb, hook, `/allow-main` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** an `Edit`/`Write` in the primary checkout while it sits on the base
branch is refused by the harness, naming the two exits — and every cannot-tell
allows it in silence.

## Tasks

- [x] Add `spec-env main <check|allow|status>` (`packages/common/src/env/mainguard.js`
      + the CLI case). `check` follows `review gate --check`'s contract exactly:
      exit 1 and print the reason, or exit 0 and say nothing.
- [x] Write the positive signal as one pure function (`judgeMainWrite`) with the
      blind spots named beside it. All four parts must hold; each cannot-tell is
      its own early return rather than a combined condition, so a later reader
      cannot widen the others by deleting one.
- [x] Add `guards.mainIsLandingZone` to `config.js`, defaulting to `true`. A
      non-boolean is dropped by the merge, so a mistyped `"false"` leaves the
      guard **on** — the safe way to be wrong about a value nobody can see.
- [x] Write `packages/common/assets/hooks/main-guard.cjs` on the write tools,
      modelled on `review-gate.cjs`: same stdin shim, same `findEngine` walk,
      same deny-JSON route, same fail-open on every path.
- [x] Word the refusal so it carries both exits and names `/allow-main` as
      **the user's** command.
- [x] Generalise `hooks.js` to register N hooks — one `HOOKS` list, one
      `ensureOneHook`, and `ensureHooks` over it. Every property it had earned
      is kept: unknown keys preserved, a malformed file untouched, matching on
      the script **path** so an operator's wrapping is migrated in place, and
      idempotent. `ensureReviewGateHook` stays as an alias.
- [x] Add `packages/common/assets/commands/allow-main.md` — a command, not a
      skill, `disable-model-invocation: true`.
- [x] Session-scope the allow with `CLAUDE_CODE_SESSION_ID` / the payload's
      `session_id`, degrading to a repo-wide toggle when neither exists, with
      `main status` saying which kind is in force.
- [x] Document it in `spec-planning.md`, plus `--help`, `env.config.md`,
      `docs/index.html` (chip **and** verb table) and three READMEs.
- [x] Tests (`env-mainguard.test.js`, 21): the positive signal, the refusal's
      two exits, both allow scopes, the strict read of a malformed allow file,
      all four status states, and the config key.
- [x] Tests (`main-guard-hook.test.js`, 16): the real script against a real git
      repo — every write tool denied, every non-write tool ignored, the
      session-scoped allow, `off`, and the allow file being gitignored.
- [x] Tests (stays-silent, one per blind spot, asserting **empty output** rather
      than merely a non-deny): a worktree on a spec branch; the primary checkout
      on a spec branch; no `env.config.json`; a non-git directory;
      `mainIsLandingZone: false`; no engine; an engine exiting non-1 with output
      on stdout; an unreadable payload; a payload with no tool name.
- [x] Tests (`assets-allow-main.test.js`, 13): the user-only marking beside
      `/no-spec`'s deliberate absence of it, the reason, the two allow kinds, and
      every load-bearing sentence in the hook and the rule.
- [x] Run the project's test command — **3207 pass, 0 fail** (`node --test`).

## Notes

**Ships last, and that is a safety property.** Until `/no-spec` existed the
guard had nowhere to send anyone, and a guard with no exit gets switched off
wholesale rather than answered.

**The asymmetry with phase 3 is the design.** `/no-spec` is model-invocable so
Claude can move work *off* the base branch on its own; `/allow-main` is user-only
so it cannot lift the guard.

`git` is untouched by this matcher, so `spec-env integrate`'s `merge --ff-only`
into the primary checkout still writes files on the base branch exactly as it
must — landing is not editing.
