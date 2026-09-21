# Bug: `review skip` cannot be told which spec

> **Type:** Bug
> **Name:** bug-review-skip-cannot-name-spec (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixed (test green)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-21
> **Area:** `packages/common/src/cli.js` (`specEnvReviewSkip`, the `spec-env review` dispatch)
> **Stack:** worktree

## Symptom

`skitterspec spec-env review skip "<reason>"` is one of exactly two things that
clear an armed review gate, and the gate's own refusal text names it. It cannot
be told **which** spec.

For a spec whose worktree no longer exists, in a repo where two or more other
specs have worktrees standing, the documented exit is unreachable:

```
spec-env review skip: cannot tell which spec — no spec given, and 2 specs have
worktrees — name the one you mean, or run this from inside one:
  1. bug-signoff-team-select-value-lost
  2. feat-logging-heartbeat
```

Both halves of that advice are impossible. The spec cannot be named — the
argument is read as the *reason*, so `review skip <spec> "<why>"` silently
skips nothing and the name never reaches the resolver. And its worktree is
gone, so there is nowhere to run it from inside. Neither listed spec is the one
that is armed.

The gate is then permanent: it reports `armed` to every query, `/spec-next`
refuses the next phase, the commit hook refuses in a worktree that no longer
exists, and nothing shipped can clear it. The reporter had to hand-edit
`.spec-env/reviews/<spec>.gate.json` back to `armed: false`.

**Reported from `ereqs`**, verified against 17.3.0.

**How it is reached in normal use** — `/spec-cancel` refuses a teardown
(unpushed commits, dirty tree) *after* a gate is armed and the operator removes
the worktree by hand; or any spec completed or cancelled while a gate was armed,
in a repo with other worktrees standing.

## Root cause

`specEnvReviewSkip` hard-codes the third argument of `gateTarget`:

- `packages/common/src/cli.js:2590` — `const target = gateTarget(dir, config, null)`,
  so the target resolves only from the cwd's worktree or from there being
  exactly one provisioned spec.
- `packages/common/src/cli.js:5120` — the dispatch passes `positional[1]` as the
  **reason**, with a comment recording the decision: *"the two are
  indistinguishable as free text"*.

Its siblings do not have this asymmetry — `review gate <spec>` and
`review <spec> --claim-since` both take a name. The refusal text tells the
operator to "name the one you mean", which describes a feature the command does
not have.

## Failing test (red)

`packages/common/test/env-review-gate.test.js` —
*"a skip can name the spec, which is the only way out when its worktree is gone"*.

Scaffolds a repo where the armed spec has **no** worktree and two other specs
do, then runs `review skip <spec> "<reason>"` and asserts the gate clears.

Run: `node --test packages/common/test/env-review-gate.test.js`

Red before the fix — the skip refuses with `cannot tell which spec`, listing
the two other specs, and `gate --check` still exits 1.

## Fix

- [x] `specEnvReviewSkip` takes the spec: `review skip [<spec>] "<reason>"`,
      passing it to `gateTarget` as its siblings do.
- [x] One positional disambiguates on a **positive signal** — it is a spec only
      where it resolves to one; anything else is a reason, which is today's
      behaviour and the harmless branch
      (`.claude/rules/negative-checks.md` rule 1).
- [x] A reason stays required in both forms; `skip <spec>` with no reason
      refuses rather than recording the spec's name as its own reason.
- [x] Stays-silent test: the bare form in a repo with one worktree behaves
      exactly as today.
- [x] Failing test now passes (GREEN); `node --test` clean, no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review skip [<spec>] "<reason>"` — new optional leading spec argument |
| CLI command | update | `spec-env review skip` usage + no-reason refusal name the spec form |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-21 — Bug reproduced; failing test added (red).
- 2026-09-21 — Fixed: `skip` splits its positionals into a spec and a reason,
  deciding a lone one on whether it resolves to a spec; test green, 3528 pass.
- 2026-09-21 — Scope: `/spec-skip` still cannot name a spec — it passes
  `"$ARGUMENTS"` as one quoted word, so word-splitting it would break the
  unquoted multi-word reason that is its common case. Left for its own spec.
