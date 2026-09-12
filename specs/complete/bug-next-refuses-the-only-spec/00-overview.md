---
linear_identifier: "SKS-196"
linear_url: "https://linear.app/skitterbyte/issue/SKS-196/bug-spec-next-refuses-though-exactly-one-spec-is-provisioned"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: /spec-next refuses though exactly one spec is provisioned

> **Type:** Bug
> **Name:** bug-next-refuses-the-only-spec (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-09-12)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-12
> **Area:** packages/common/assets/skills/spec-next/SKILL.md, packages/common/assets/skills/spec-start/SKILL.md, packages/common/test
> **Stack:** worktree

## Symptom

`/spec-start feat-skill-report-contract` did its whole job: worktree provisioned,
spec moved to `in-progress`, developer stamped, Linear linked (SKS-191),
committed clean. It `cd`'d the session into the worktree, exactly as its step 3
says.

The context was then cleared. A bare `/spec-next` refused:

```
no spec in flight — run /spec-start <name> to start one
```

…on a repo holding exactly one provisioned worktree, which the engine resolves
without a hint of ambiguity:

```
$ pnpm exec skitterspec spec-env resolve
spec:       feat-skill-report-contract (in-progress)
worktree:   /Users/reubengreaves/code/skitterspec-wt/skill-report-contract
```

The operator had to re-supply, by hand, something the repo already knew — which
is the opposite of the contract `/spec-start` advertises: get the worktree and
the tracker sorted so that the next command is just `/spec-next`.

## Root cause

`/spec-next` §1 resolved from three rungs — the live spec of this checkout, the
worktree the session is standing in, the current branch in `checkout` mode — and
on the **absence** of all three concluded *"no spec in flight"*
(`packages/common/assets/skills/spec-next/SKILL.md:45-58`).

All three read **session** state. Session state does not survive a `/clear`, a
new terminal tab, or coming back tomorrow; the provisioned worktree each of them
is a proxy for is on disk and survives all three. So the lookup was strictly
narrower than the claim it fed — `negative-checks.md` rule 1, an absence treated
as evidence when nothing had established the lookup could have seen the thing.

The positive signal already existed and was already correct. `provisionedSpecChoice`
(`packages/common/src/cli.js:914-941`) resolves *the worktree you are standing in,
else the sole provisioned spec, else the candidate list* — and
`.claude/rules/spec-planning.md` documents that resolution as universal:
*"Omit the spec name anywhere and it uses the worktree you are standing in, else
the sole provisioned spec — with no exceptions left."* `/spec-next` was a silent
exception to a rule the project states has none, and it is the one command in the
workflow for which being wrong writes code.

Not a `/spec-start` bug: its `cd` is real and it confirms the move landed. The
`cd` is simply session state, and nothing `/spec-start` can do makes session
state outlive the session.

## Failing test (red)

`packages/common/test/assets-spec-next-resolution.test.js` — ten assertions
pinning the durable rung and, just as deliberately, the refusal it must not
loosen. Run with:

```
node --test packages/common/test/assets-spec-next-resolution.test.js
```

Red before the fix: **9 failed, 1 passed**. The one that passed is
*"rules 1-3, the refusal and the in-context ban are intact"* — green on both
sides by design, which is what makes it the guard rather than the repro.

## Fix

- [x] Add **rung 4** to `/spec-next` §1 — `skitterspec spec-env resolve` with no
      argument, taken **only when it names exactly one spec**; it sits below rules
      1-3, so a session standing somewhere specific is never overruled.
- [x] Require the rung to **announce** what it resolved and why, before writing a
      line — rungs 1-3 are self-evident to whoever typed the command; this one is
      not.
- [x] Keep the refusal whole: several worktrees is still a refusal (relay the
      engine's list, never pick from it), zero worktrees still prints
      `no spec in flight`, and the spec "in context" is still never a fallback.
      Say why rung 4 is not that fallback wearing a hat — a worktree on disk is a
      record that someone ran `/spec-start`.
- [x] Name the blind spot beside the check (`negative-checks.md` rule 2): a
      worktree left by a declined teardown still counts as provisioned, which
      widens the set into an *ambiguity the engine refuses on* — never a wrong
      spec built.
- [x] Fix the promise `/spec-start` could not keep — its step 6 stop-here ending
      now holds from a fresh session too, and it says the `cd` is a convenience
      rather than the load-bearing part, so rung 4 is not deleted later as
      redundant.
- [x] Failing test now passes (GREEN); full suite green — **2015 passed, 0
      failed** (`pnpm test`). No typecheck script in this repo; `node --test` is
      the gate.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `/spec-next` §1 — resolution gains rung 4 (sole provisioned spec, via the engine) |
| Skill/rule | update | `/spec-start` §3/§6 — the `cd` named as convenience; stop-here ending true across sessions |

No engine change: `spec-env resolve` already answered this correctly and is
already covered (`cli-spec-env-zero-arg.test.js:81`). The bug was a skill that
did not ask it.

## Notes

- **Lands with the branch.** This repo dog-foods via `.claude/skills/*` symlinked
  into the **composed** dist assets, which are gitignored and rebuilt from
  `packages/common/assets`. So this repo's own `/spec-next` picks the fix up when
  the branch merges, not before.
- **Expect a conflict with `feat-skill-report-contract`.** That spec is in flight
  and its Area covers `packages/common/assets/skills`; whichever lands second
  rebases over the other's §1 edits.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-12 | In Progress | in-progress | Reuben Greaves |
| 2026-09-12 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-12 — Bug reproduced; failing test added (red, 9/10).
- 2026-09-12 — Root cause: `/spec-next` resolved only from session-local signals
  and read their absence as "no spec in flight", while the engine's durable
  resolution — documented as universal — was never asked.
- 2026-09-12 — Fixed: rung 4 added, refusal untouched; suite green (2015/0).
- 2026-09-12 — One pre-existing assertion widened rather than kept:
  `assets-spec-start-offer.test.js` pinned the literal phrase *"an hour later
  does exactly"*, which the durability clause splits. Intent preserved and
  extended — it now also asserts the ending holds "from this session or a fresh
  one".
- 2026-09-12 — Completed; all phases done, tests green (2015/0). Nothing
  deferred.
- 2026-09-12 — While reproducing, this session's own shell had drifted into
  another spec's worktree from an earlier `cd`, and a relative `mkdir` put the
  stub there. Caught before any commit and moved. Noted because it is the same
  failure mode from the other side: a session's location is invisible state, and
  the fix is to stop depending on it.
