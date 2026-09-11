---
linear_identifier: "SKS-144"
linear_url: "https://linear.app/skitterbyte/issue/SKS-144/one-bare-form-one-meaning"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# One bare form, one meaning

> **Type:** Feature
> **Name:** feat-bare-argument-parity (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-11)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-11
> **Area:** packages/common/src/cli.js, packages/common/assets/commands/spec-live.md, packages/common/assets/commands/spec-connect.md, packages/common/assets/rules/spec-planning.md, packages/common/test/cli-spec-env-zero-arg.test.js, packages/common/test/cli-spec-env-live.test.js, docs/index.html
> **Stack:** worktree

## Problem

Every `spec-env` verb answers the same question when you omit the spec name —
*the spec you are standing in* — except two. `live` with no argument means
**status**, so putting the current spec on the running server needs the extra
word `take`. `connect` with no argument means **`main`**, so the bare form
**disconnects**: it is the only verb in the family whose zero-arg behaviour is
the opposite of acting on your spec.

The cost is small each time and constant. The `take` friction is the one people
notice; the `connect` inversion is the one that surprises them, because nothing
about `/spec-connect` suggests it hands ports back.

## Decisions

1. **Bare `/spec-live` takes when it can tell, and reports when it cannot.**
   Exactly one spec resolves *and* the workbench is free → take it. Anything
   else — several worktrees, another spec already holding the instance, a dirty
   primary checkout — prints the status report unchanged. Three states, not two,
   with the unknown one routed to the harmless branch
   (`.claude/rules/negative-checks.md` rule 4).
   *Rejected:* bare = take unconditionally. It turns an argument-less command
   into an unconditional branch switch, and converts a useful report into a
   refusal at exactly the moment you are unsure what is going on.
2. **Bare `/spec-connect` connects the resolved spec.** `/spec-connect main`
   (and the configured base branch) stays the way to hand the ports back, which
   is the form every doc already leads with.
3. **This deliberately supersedes Decision 8 of
   `feat-script-only-commands`**, which ruled that zero-arg resolution must never
   replace an existing meaning and named this exact inversion — "silently invert
   `spec-env connect` from 'hand the ports back' to 'seize them'" — as the reason.
   That decision was right about a **side effect**: it was guarding a general
   change from quietly altering two verbs nobody was thinking about. Here the
   alteration **is** the change, it is the whole user-visible point, and it ships
   with its own release note. The word doing the work in that decision is
   *silently*.
4. **The four verbs are untouched.** `take`, `release`, `abort` and `status`
   stay exactly as they are — they are the engine's real operations, and `abort`
   is crash recovery that deliberately refuses things `release` does not. Only
   the grammar in front of them changes.
5. **`live status` keeps its own zero-arg meaning.** Omitting the spec from
   `live status` still gives the repo-wide report rather than a per-spec verdict.
   That is a missing argument to an explicit verb, not a missing verb — a
   different question, and its stays-silent test stays as it is.
6. **The inverted guards are rewritten, not deleted.** The two stays-silent
   tests that currently pin the old meanings become stays-silent tests for the
   new ones, each carrying a comment naming the superseded decision. A guard that
   disappears in the same commit as the behaviour it guarded leaves nothing
   behind to explain why.

## Solution overview

```
BEFORE                                  AFTER
/spec-live                → status      → take, when unambiguous and free
/spec-live take           → take        → take                (unchanged)
/spec-live <spec>         → take spec   → take spec           (unchanged)
/spec-live main           → release     → release             (unchanged)
/spec-live status         → status      → status              (unchanged)

/spec-connect             → disconnect  → connect the resolved spec
/spec-connect <spec>      → connect     → connect             (unchanged)
/spec-connect main        → disconnect  → disconnect          (unchanged)
```

`liveGrammar` gains one arm: with no positional argument, ask whether a spec
resolves unambiguously and whether the workbench is free, and answer `take` or
`status` accordingly. `specEnvConnect` drops `specArg || 'main'` and resolves the
bare case the way every other verb does.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI grammar | update | `liveGrammar()` — bare → `take` or `status` |
| CLI grammar | update | `specEnvConnect()` — bare no longer means `main` |
| Command | update | `spec-live.md` · `spec-connect.md` — `description`, `argument-hint` |
| Skill/rule | update | `spec-planning.md` — the live-overlay and connect paragraphs |
| Docs | update | `docs/index.html` — the two engine-table rows and the bare-argument note |
| Test | update | `cli-spec-env-zero-arg.test.js` — two stays-silent guards invert |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Bare `/spec-live` takes when it can tell | ✅ | [01-bare-live.md](01-bare-live.md) |
| 2 | Bare `/spec-connect` connects | ✅ | [02-bare-connect.md](02-bare-connect.md) |
| 3 | Documentation, and the superseded decision | ✅ | [03-docs-and-supersede.md](03-docs-and-supersede.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-11 | Ready | backlog | Reuben Greaves |
| 2026-09-11 | In Progress | in-progress | Reuben Greaves |
| 2026-09-11 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-11 — Completed; all three phases done, tests green (root 1753, common
  633). Nothing deferred from the spec. One follow-up sits outside it and is
  recorded above: `spec-env review` prints a bare absolute path that no terminal
  linkifies, and a `file://` URL beside it would make the page one click away —
  a `fix(env)` commit for after this lands.

- 2026-09-11 — Phase 3 built; the spec is complete. The grep sweep the phase
  insisted on was the right call: the only surface still carrying the old
  wording outside the listed files was the `Usage:` NOTE inside `specEnv()` in
  `cli.js`, which spelled out both exceptions in prose nobody greps for. It now
  states the rule without exceptions. The emphasis guard widened earlier today
  caught a straddling bold span in the `spec-planning.md` edit, which is the
  second time it has fired on prose written the same day.
- 2026-09-11 — Follow-up noted, deliberately outside this spec: `spec-env review`
  prints a bare absolute path, which no terminal linkifies. Printing a `file://`
  URL alongside it makes the page one click away on every desktop. It is a
  `fix(env)` commit for after this lands, not argument grammar.

- 2026-09-11 — Phase 2 built. The inversion is now real in both directions:
  `specEnvConnect` resolves a missing argument through
  `resolveSpecWithWorktree` like every other verb, and the disconnect form is
  `main` or the configured base — named, never assumed. Ambiguity refuses with
  the candidate list rather than degrading, since `connect` has no read-only
  answer to degrade to. The superseded Decision 8 is quoted in the test that
  inverted, so the next reader finds the reversal rather than concluding the old
  assertion was a mistake.

- 2026-09-11 — Phase 1 built. One structural decision the spec did not call:
  telling "several worktrees" from "no worktrees" required distinguishing two
  states that `soleProvisionedSpec` only expressed as Error messages, and
  pattern-matching those would have promoted prose nobody thought was
  load-bearing into API. It is now `provisionedSpecChoice`, returning
  `{ folder }` / `{ candidates }` / `{}` as data, with `soleProvisionedSpec` a
  thin wrapper that throws the same two errors — so every other subcommand's
  behaviour and messages are unchanged, and the zero-arg suite proves it.
- 2026-09-11 — The old stays-silent guard asserting a bare `live` is read-only
  was **inverted, not deleted**, and carries a comment naming this spec. Its
  other half — that the alias arm does not swallow the explicit verb forms — is
  untouched and still the reason the test exists.

- 2026-09-11 — Spec created. Raised from the observation that taking the current
  spec needed the word `take`; grilling widened it, because `connect` turned out
  to have the louder version of the same problem and the two are one rule. The
  recollection that prompted it — that `/spec-live` was "mangled" into verbs —
  is not what happened: `take`/`release`/`abort`/`status` were always the engine
  verbs, `/spec-live <spec>` broke when the skill became a pre-executed command
  (`09a5057`), and `liveGrammar` (`778bb72`) is the fix that restored it. What is
  left over from that episode is only the bare form.
