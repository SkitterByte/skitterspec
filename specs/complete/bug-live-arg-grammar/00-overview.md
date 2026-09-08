---
linear_identifier: "SKS-69"
linear_url: "https://linear.app/skitterbyte/issue/SKS-69/bug-spec-live-name-and-spec-live-main-print-usage"
---

# Bug: `/spec-live <name>` and `/spec-live main` print usage

> **Type:** Bug
> **Name:** bug-live-arg-grammar (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-08)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-07
> **Stack:** worktree
> **Area:** `packages/common/src/cli.js` (`specEnvLive`)

## Symptom

Every doc tells the user to type **`/spec-live <spec>`** to put a spec on the
running instance and **`/spec-live main`** to hand it back. Neither form exists.
Both print a usage line and do nothing:

```
$ pnpm exec skitterspec spec-env live main
Usage: skitterspec spec-env live <take|release|abort|status> [spec]
```

The only working grammar is the verb form (`live take <spec>` / `live release`),
which no user-facing document mentions. The claim is made in
`rules/spec-planning.md:71,75`, the CLAUDE.md section (`claude-md-section.md:44`),
and — worse, because Claude repeats them to the user as instructions —
`spec-go/SKILL.md:37,128`, `spec-complete/SKILL.md:123` and
`spec-to-main/SKILL.md:55`. A comment in the live tests
(`cli-spec-env-live.test.js:165`) asserts the same belief in prose while the test
beside it calls `live release`.

Reported while trying to put the spec in context live: there is no way to say
"this one", and the documented shorthand that would have made naming it cheap
turns out not to work either.

## Root cause

`specEnvLive` (`packages/common/src/cli.js:1153`) dispatches on a **closed verb
set** and routes everything else to a usage message:

```js
const action = positional[0] || 'status'
switch (action) {
  case 'status': …  case 'take': …  case 'release': …  case 'abort': …
  default: /* usage */
}
```

`/spec-live` used to be a **skill**, and its step 1 did the translation the
engine never had: *"Use the spec named as an argument. The literal `main` means
release."* Commit `09a5057` (`feat(skills): move spec-connect and spec-live to
commands`) deleted that SKILL.md and shipped `.claude/commands/spec-live.md` as
an untranslated relay of `spec-env live $ARGUMENTS`. The conversion was right
about tokens and wrong about where the grammar lived: it moved the front door
onto an engine that had only ever been asked for the verbs, and the two
documented forms lost their only implementation. The docs were left describing
the skill.

`spec-env connect` survived the same conversion because its argument handling was
already user-shaped: `const target = specArg || 'main'`, then any other value is a
spec name (`cli.js:1058`). `live` is the odd one out.

## Fix

- [x] Add an alias arm to `specEnvLive`: an argument that is not one of the four
      verbs means **`take <spec>`**, and `main` (or the resolved base branch)
      means **`release`** — so the engine accepts the grammar the docs promise
      while the command stays a pure relay.
- [x] Keep verb precedence explicit and commented: the four verbs and the base
      branch are matched **before** the spec-name fallback, so a spec folder
      named `status` can never silently branch-switch the repo.
- [x] Failing tests now pass (GREEN); run the full suite — confirm no regressions.
- [x] Correct the stale prose: the misleading comment at
      `cli-spec-env-live.test.js:165`, and the `spec-env` usage line
      (`cli.js:1465`) so the spec-name form is discoverable from `--help`.
- [x] Refresh the command's `argument-hint` and `description` — the menu entry
      the user actually reads while typing `/spec-live`. It advertised the verb
      grammar alone, and never mentioned that a bare `take` resolves the spec
      you are on. Both the shipped asset and the dogfooded `.claude/` copy.

## Not fixing (and why)

**No `/spec-live-current` wrapper.** The other half of the report — "there is no
way to say *this* spec" — is deliberately left alone. As a skill it would undo
exactly what `09a5057` bought (a model turn to compute a spec name). As a script
it would be redundant: `soleProvisionedSpec` (`cli.js:579`) already resolves an
omitted spec from the cwd's worktree or a sole provisioned spec, and the only
case it cannot resolve — two-plus worktrees while standing in the primary
checkout — is ambiguous to **any** script. Its numbered "name the one you mean"
list is the correct answer there, not a defect. When Claude does know the spec
from context it can run `spec-env live take <spec>` directly; the command is the
type-it-yourself door, not the only door.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env live <spec>` → take; `spec-env live main` → release |
| CLI command | update | `spec-env` usage line names the spec-name form |
| Command | update | `/spec-live` argument-hint + description (asset and installed copy) |

Behaviour-compatible: every existing verb form keeps its meaning, and the four
verbs win over a same-named spec.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-07 | In Progress | in-progress | Reuben Greaves |
| 2026-09-08 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-07 — Bug reproduced; three tests added to
  `cli-spec-env-live.test.js` (two red: `live <spec>`, `live main`; one
  stays-silent, green from the start, pinning the verb forms).
- 2026-09-07 — Scoped to the grammar regression only; `/spec-live-current`
  rejected with reasons recorded under **Not fixing**.
- 2026-09-07 — Fixed: `liveGrammar` translates `live <spec>` → take and
  `live main` / `live <base branch>` → release, ahead of the verb switch; verbs
  keep precedence. A bogus name now reports `spec not found` instead of a usage
  line. Suite green (1306/1306).
- 2026-09-07 — No doc edits needed: the engine now does what
  `rules/spec-planning.md`, the CLAUDE.md section and the three SKILL.md files
  already claimed. Only two genuinely stale strings changed — the test comment
  and the `spec-env` usage block.
- 2026-09-07 — Follow-up: the fix restored the grammar but left `/spec-live`'s
  `argument-hint` advertising verbs only, so the one form that already answered
  "the current spec" — a bare `take` — stayed invisible at the point of typing.
  Hint and description updated. **Not** changing bare `/spec-live` from status to
  take: a bare word must not branch-switch the primary checkout.
- 2026-09-08 — Completed; all Fix tasks done, suite green (1306/1306). The two
  originally-red tests (`live <spec> means take`, `live main means release`)
  pass. Nothing deferred; `/spec-live-current` stays rejected on the record
  above, not deferred.
