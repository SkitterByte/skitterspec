---
linear_issue_id: "SKS-292"
---

# Phase 3 — A pass nobody heard is found on the way back in ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a verdict that no wait ever saw — because the session was cleared, the
terminal closed, or the wait never ran — is surfaced the next time anyone does
anything, without being claimed.

## Tasks

- [x] Add a pure scan to `packages/common/src/env/review.js`: given the reviews
      directory, return every waiting pass across every spec as
      `{ spec, code, verdict, at }`, oldest first and stable — ties on the code,
      as `describePending` already does.
- [x] **Read the sidecar directory, never the provisioned list.** `specEnvStatus`
      walks specs that have a worktree, and all ten stranded passes belong to
      specs completed and torn down. Write the blind spot beside the check
      (`.claude/rules/negative-checks.md` rule 2): *scoping this to provisioned
      specs would make it blind to the case that produced it.*
- [x] Skip a store that will not parse, and name it on its own line rather than
      reading it as empty — an unreadable sidecar holds someone's pass, and
      "nothing waiting" is the one reading that is certainly wrong (rule 4).
- [x] Expose it as `spec-env review waiting [--json]`.
- [x] `spec-env status` prints a `Reviews waiting:` section from it — spec, code,
      verdict, age via `pendingAge` — then
      `disown one with: spec-env review <spec> --drop <code>`.
- [x] **Print it whether or not any spec is provisioned.** `specEnvStatus`
      early-returns on an empty provisioned list today, and a repo with nothing
      in flight is exactly where a stranded pass hides longest.
- [x] `--json` gains a `waiting` array, absent entirely when nothing is waiting,
      so a consumer that predates this sees a byte-identical object.
- [x] Spec skills check it on entry and report what they find — the spec, the
      code, the verdict, the age, and the pickup — then carry on with whatever
      they were asked to do. It is information, not a gate.
- [x] **It never claims.** Reporting a pass is not taking one; `/spec-diff` §0
      is untouched, and the pickup still needs a person to ask for it.
- [x] Tests: passes across several specs list oldest-first; a spec with **no
      worktree** is still listed — the case the whole phase exists for; an
      unreadable store is named rather than counted as zero; a repo with nothing
      provisioned still prints the section.
- [x] Stays-silent test: a repo with no waiting pass prints exactly what it
      prints today, `--json` gains no key, and no skill mentions reviews at all.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The ten passes that motivated this are real and on disk. Clearing them is a
one-off `--drop`, not part of this spec — and they make a good fixture for
eyeballing the output, so run `status` before dropping them.

**Two entry points, not every spec skill.** The task said "spec skills check it
on entry"; it landed in `/spec-next` and `/spec-start`, which are the realistic
ways back in — you either start a spec or continue one. A line about waiting
reviews on a `/spec-cancel` is noise beside the thing the operator asked for,
and a rule nobody needs is a rule that teaches people to skim. The stays-silent
test asserts the others were left out deliberately rather than missed.

**A guard that matched something else is not a guard.** The claims-nothing test
first allowed `/never claim/` anywhere in the file — and these skills say that
in other contexts, so weakening the rule to *"you may claim one"* left it green.
It is anchored to the waiting block now, and proved red against that exact
mutation.

**It found all ten on its first run**, plus `635132` on this spec — which is the
whole feature working on the evidence that motivated it.
