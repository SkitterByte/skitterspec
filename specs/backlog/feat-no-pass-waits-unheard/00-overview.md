---
linear_identifier: "SKS-289"
linear_url: "https://linear.app/skitterbyte/issue/SKS-289/no-review-pass-waits-unheard"
---

# No review pass waits unheard

> **Type:** Feature
> **Name:** feat-no-pass-waits-unheard (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-16
> **Area:** `packages/common/src/env/review.js`, `packages/common/src/cli.js`, `packages/common/assets/skills/spec-next/SKILL.md`, `packages/common/assets/skills/spec-bug/SKILL.md`, `packages/common/assets/skills/spec-diff/SKILL.md`, `packages/common/assets/rules/spec-reports.md`
> **Stack:** worktree

## Problem

A phase that ends renders its page, arms the gate, and **waits** — and the
banner says so: *"I'm holding here until you send a verdict."* The skills tell
the agent to *"watch the pending store and end your turn"* and stop there. How
to watch is left to the agent, so every run invents one, in shell, and a broken
one looks exactly like a patient one.

Three separate failures in two days, all reported as *"I pressed the button and
nothing happened"*:

1. **A watcher that could never fire.** An agent wrote
   `until [ -f "$P" ] && [ "$x" \> "$y" ]`. `\>` is a bash-ism; the `[` builtin
   in zsh — the shell these tools run — rejects it and exits 2. The loop spun for
   five minutes writing `condition expected: >` to stderr, which a background
   task collects and never notifies on. The verdict was never going to be seen.
2. **A watch that timed out.** Another run bounded its watch at one hour, the
   maximum for a bounded monitor. The reader came back from lunch at two hours
   and pressed. Nothing was listening.
3. **A stale URL.** `servePort` defaults to `7777` for every repo. A second
   repo's daemon takes it, this one is refused and moved to `7778` with
   `--port`, and a link handed out earlier now points at a stranger's server,
   where the token means nothing and the POST `404`s. Observed: an `ereqs`
   daemon holding `7777` while this repo's sat on `7778`.

The engine is not at fault in any of them. A pass never expires, the gate stays
armed, `pendingAge` reports the age, and a re-render prints `pending: N waiting`.
Ten passes across six completed specs are sitting unclaimed on disk right now,
and every one of them is recoverable. Nobody was ever **told**.

The common factor is not the bug in any one watcher. It is that **the wait has no
implementation** — only an instruction to improvise one — and that **silence is
the success signal**, so an improvisation that cannot possibly work is
indistinguishable from one that is patiently working.

## Decisions

1. **The engine owns the wait.** `spec-env review wait` blocks on the pending
   store and exits when a pass arrives, in Node, written once and tested.
   Skills invoke it instead of composing shell. Rejected: pinning rules in prose
   across four documents — that was this spec's first draft, and failure (1)
   proves why it is not enough. The shell quoting, the zsh/bash divergence, and
   the per-run predicate all vanish when there is nothing to improvise.

2. **Silence is never success.** The wait reports a positive signal — it started,
   it is alive, it finished with a reason — and a caller that cannot establish
   the wait is running says so rather than standing quietly beside a corpse.
   Failure (1) ran for five minutes looking exactly like patience.
   `.claude/rules/negative-checks.md` rules 1 and 3.

3. **No timeout by default.** The lifetime is the session, because any number is
   a guess about how long someone reads and a reader who walks away is the
   *normal* case — it is the whole reason the page exists rather than a terminal
   dump. `--timeout` exists for a caller that genuinely needs one; the skills do
   not pass it.

4. **It re-checks on the way back in, too.** A wait that never fired, a session
   that was cleared, a terminal closed overnight — none of those are recoverable
   by any watcher, however good. The gate already records `armed` + `armedAt`
   durably; nothing has ever looked at it except `/spec-next`'s pre-flight. Any
   spec skill entering finds a waiting pass and says so.

5. **It reports and never claims.** Naming the spec, the code, the verdict and
   the age, with the pickup offered — but the claim still needs a person
   (`/spec-diff` §0). Rejected: auto-claiming anything that arrived after
   `armedAt`, which would widen the window from *"while a session was actively
   waiting"* to *"at any point since"* — a real loosening of the one guard
   standing between a stranger's POST and the repo.

6. **`spec-env status` answers *is anything waiting anywhere?*** Rejected: a
   dedicated verb, which you only run once you already suspect a stranding; and
   the served index page, visible only while a server is up and only to someone
   who thought to open it.

7. **The scan reads the sidecar directory, never the provisioned list.**
   `specEnvStatus` walks specs that have a **worktree**, and all ten stranded
   passes belong to specs that were completed and torn down — so scoping to
   provisioned specs would be blind to exactly the case that produced the
   evidence.

8. **The port collision is out of scope**, and recorded as a follow-up. It
   produces the same symptom by a different mechanism and wants its own fix
   (a per-repo port, or a URL that survives a restart). Folding it in here would
   make one spec answer two unrelated questions.

## Solution overview

**The wait becomes a command.**

```
skitterspec spec-env review wait [spec] --since <iso> [--timeout <seconds>] [--json]
```

It polls the spec's pending store and exits on the first pass that arrived at or
after `--since`. Exit `0` and print the code when one does; a distinct non-zero
when a timeout was given and reached; another when more than one arrived, which
is the ambiguity `--claim-since` already refuses to resolve. It writes nothing
and claims nothing — it is the wait, and the claim stays a separate, deliberate
step.

The skills then say one thing instead of describing a loop:

> Run `spec-env review wait <spec> --since <t>` in the background and end your
> turn. On waking, claim with `--claim-since <t>`.

**Re-entry becomes a check.** `spec-env review waiting [--json]` scans every
`.spec-env/reviews/*.pending.json` and reports what is there. Spec skills call
it on entry; `spec-env status` prints it as a section.

```
Reviews waiting:
  feat-orders            418207 · commit · 2 hours ago
  bug-review-gate-hook   416964 · commit · 3 days ago
  disown one with: spec-env review <spec> --drop <code>
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env review wait [spec] --since <iso> [--timeout <s>]` |
| CLI command | add | `spec-env review waiting [--json]` — every waiting pass, all specs |
| CLI command | update | `spec-env status` — a `Reviews waiting:` section; `--json` gains `waiting` |
| Engine API | add | a wait primitive, and a cross-spec scan of the reviews sidecar directory |
| Skill/rule | update | `/spec-next` §5, `/spec-bug` §5b, `/spec-diff` §4b, `spec-reports.md` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The engine owns the wait | ⬜ | [01-the-engine-owns-the-wait.md](01-the-engine-owns-the-wait.md) |
| 2 | The skills stop improvising one | ⬜ | [02-skills-stop-improvising.md](02-skills-stop-improvising.md) |
| 3 | A pass nobody heard is found on the way back in | ⬜ | [03-found-on-the-way-back-in.md](03-found-on-the-way-back-in.md) |

## Open questions

- [ ] None.

## Changelog

- 2026-09-16 — Spec created, from a verdict pressed ~2 hours after the render
  and never picked up. Ten unclaimed passes found on disk while writing it.
- 2026-09-16 — **Rewritten.** First draft blamed the watch's *lifetime* and
  proposed pinning it in prose. Two more failures landed while it was being
  written — a zsh-incompatible predicate that could never fire, and a cross-repo
  port collision — and neither is a lifetime problem. The common factor is that
  the wait has no implementation, so every run improvises one and silence reads
  as patience. The engine owns it now; the prose rules follow from that rather
  than standing in for it.
- 2026-09-16 — Follow-up recorded: `servePort` is `7777` for every repo, so a
  second repo takes it and this one is moved aside, leaving a link handed out
  earlier pointing at a stranger's daemon. Out of scope here. (First written as
  a *silent* fallback — it is not: `ensureReviewServer` refuses with
  `port 7777 is already in use`, and the move happens because a caller then
  passes `--port`.)

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |
