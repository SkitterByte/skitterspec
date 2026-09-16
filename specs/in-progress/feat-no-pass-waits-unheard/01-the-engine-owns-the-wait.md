---
linear_issue_id: "SKS-290"
---

# Phase 1 — The engine owns the wait ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** waiting for a verdict becomes one tested command instead of a shell
loop each run invents — and a wait that cannot work says so instead of looking
patient.

## Tasks

- [x] Add `spec-env review wait [spec] --since <iso> [--timeout <seconds>]
      [--json]`. It polls the spec's pending store and returns on the first pass
      whose `at` is at or after `--since`. Reuse `passesSince` — the window rule
      is already written and already routes an unparseable `at` to inaction.
- [x] **Distinct exits, because the caller acts differently on each.** `0` and
      the code when one pass arrived; one non-zero for a timeout that was asked
      for and reached; another for more than one in the window — the ambiguity
      `--claim-since` refuses to resolve, so this must not resolve it either.
- [x] **No timeout unless asked.** Omitted means wait as long as the process
      lives. Name the reasoning beside the default: any fixed number is a guess
      about how long someone reads, and a reader who walks away is the normal
      case rather than the edge one.
- [x] **It waits; it never claims.** No sidecar write, no pending write, no
      gate change. The claim stays a separate deliberate step so `/spec-diff` §0
      keeps meaning what it says.
- [x] **Say it started.** Print a positive line before the first poll — the spec,
      the window, and that it is waiting — so a caller can tell a live wait from
      a dead one. Failure (1) in the Problem ran five minutes looking exactly
      like patience; silence must stop being the success signal
      (`.claude/rules/negative-checks.md` rule 1).
- [x] **Never shell out, and take no shell-quoted predicate.** The whole point
      is that the comparison happens in Node: `[ "$x" \> "$y" ]` is valid bash
      and an error in zsh, and that divergence is what produced the failure.
- [x] Tests: a pass inside the window returns its code; a pass that predates
      `--since` does not end the wait; two in the window exit with the ambiguity
      status and name the count, never a code; an unparseable `--since` refuses
      rather than waiting forever on a window it cannot compute; a `--timeout`
      that elapses exits with the timeout status.
- [x] Stays-silent test (rule 3): a store that is absent, empty, or has only
      older passes keeps waiting — none of those is a reason to return, and a
      wait that returned on an empty store would report "no pass" as an outcome.
- [x] A test that would have caught the real bug: run the wait through the
      project's own test runner on a store that gains a pass mid-flight, and
      assert it returns. A predicate that can never be true fails this.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Poll interval is an implementation detail, not a contract — a file check every
second or two costs nothing against a sidecar of a few hundred bytes. What
matters is that it is one implementation rather than one per run.

**Two things the build turned up.**

The test harness had to run the CLI as a **child process**, not through the
in-process `run`. The exit status is the contract — a caller routes on
`arrived` versus `timeout` versus `ambiguous` — and only a real process has
one; and capturing stdout by monkey-patching `process.stdout.write` across a
multi-second await swallows the test runner's own output with it. It points at
**this** package's `bin/`, never a distribution's: those are build artefacts and
gitignored, so testing one would go green against code this phase never touched.

`addPending` **supersedes two passes that both carry `render: null`**, because
`null !== null` is false — so two readers' passes silently collapse into one.
`serve.js` claims the opposite in a comment ("absent, the pass simply never
supersedes anything, which is the harmless direction"). Out of scope here and
recorded as a follow-up; the fixture gives its two passes two renders, which is
what two real renders carry.
