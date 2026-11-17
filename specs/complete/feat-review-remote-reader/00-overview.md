---
github_identifier: "#222"
github_url: "https://github.com/SkitterByte/skitterspec/issues/222"
---

# Hide the local review link when the reader is on another machine

> **Type:** Feature
> **Name:** feat-review-remote-reader (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/222
> **Author:** Reuben Greaves
> **Raised:** 2026-11-17
> **Area:** packages/common/src/env/review.js, packages/common/src/cli.js, packages/common/assets/rules/spec-reports.md, packages/common/assets/skills/{spec,spec-next,no-spec,spec-review}/SKILL.md, docs/review.html, packages/common/test/
> **Stack:** worktree
> **Docs:** review

## Summary

When skitterspec runs on one machine and the person reading the review page is
on another (a Mac driving a Windows VM, or an SSH session), the review stack
stops offering the `local` link, which points at the wrong machine, and leads
with `network`. The wrapper or SSH session signals this. Nothing is guessed.

## Problem

The stack always lists `local` first as `http://127.0.0.1:<port>/…`. That is
right when the reader's browser is on the machine running the engine. It is
wrong when the engine runs somewhere else. The operator's setup is Claude Code
on a Mac, with a `vm` wrapper running every skitterspec command inside a
Windows VM through `prlctl exec`. The local link points at the VM's loopback,
so it hangs for several seconds and never loads. It is also first in the list
and is the link habit reaches for. A link that cannot open costs time on every
review, and it teaches the reader to distrust the stack.

Inside the VM the engine can see no automatic clue: no `SSH_CONNECTION`, no
`SESSIONNAME`/`CLIENTNAME`, no Parallels variables. The only hint is a parent
process of `prl_tools_service.exe`, which is Parallels-specific and brittle.

## Acceptance criteria

- With `SKITTERSPEC_READER=remote` set and the network tier serving, a review
  render, the epic page, the tada page and a re-shown banner print no `local:`
  line, and `network:` comes first.
- The same happens with `SSH_CONNECTION` set and `SKITTERSPEC_READER` unset.
- `SKITTERSPEC_READER=local` keeps `local` even under SSH.
- With neither variable set, every stack prints exactly as it does today.
- When the reader is remote but the network tier is off or has no address,
  `local` still prints, annotated as not reachable from the reader's machine,
  next to the network tier's enable command.
- `--json` `tiers` still carries `local`, marked `hidden` with the reason.
- In the hidden case, the wait-coverage line names only `network`.

## Decisions

1. **Use an explicit positive signal, not detection.** The signal is
   `SKITTERSPEC_READER=remote`, set by whatever wrapper runs the engine away
   from the reader, or `SSH_CONNECTION`, which SSH sets. The fact being
   detected is *the reader is on another machine*, not *this is a VM*.
   - Rejected: hypervisor or parent-process detection. It is brittle (one
     vendor's service name). It is also the wrong fact, because a browser
     inside the VM's own desktop does want `local`
     (`.claude/rules/negative-checks.md` rule 1).
2. **`SKITTERSPEC_READER=local` overrides SSH.** SSH with `-L` port forwarding
   makes the reader's loopback reach the engine's server, so `SSH_CONNECTION`
   is a strong hint but not proof. Any other value, or none, means cannot tell,
   and the stack stays as it is today (rule 4).
3. **The variable is the per-machine override, and there is no stored
   setting.** The wrapper that moves the engine is already per machine, and it
   is what knows the reader is elsewhere.
   - Rejected: a committed `review.showLocal`. It would apply to every machine
     that checks out the repo.
   - Rejected: a gitignored toggle under `.spec-env/`. That is a second piece
     of state to say the same thing.
4. **Hide `local` only when `network` has a URL.** If network is off, bound to
   loopback or has no address, hiding `local` leaves a stack with nothing to
   open. In that case `local` keeps its line, annotated
   `not reachable from the reader's machine`, beside network's existing enable
   command. A dead link that says it is dead is better than none.
5. **The engine decides, and both outputs carry the decision.**
   `reviewTierStack` reads the signal. The local tier stays in `--json` as
   `{ tier: 'local', url, hidden: true, reason }`, so tooling and tests still
   see it, and `reviewTierLine` prints nothing for a hidden tier. Every stack
   (review, epic, tada, re-show) goes through that one function, so they cannot
   disagree.
6. **The wait-coverage line follows the visible tiers.** The engine says which
   served tiers the wait covers (`--json` `covers`, and the re-show line). The
   banner copies that line instead of hard-coding "local and network".
7. **`network` keeps its name.** Renaming it `vm` would break the `tiers`
   contract for a cosmetic gain, and the operator called the rename
   non-essential.
8. **Amend the tier rule in `spec-reports.md`, a third time, with the
   argument recorded.** "Always all three" exists so that a reader can see
   every door they could ask to open. A `local` link pointing at another
   machine is not such a door: it never opens, and it costs a timeout every
   time. An off tier keeps its line, because a reader can switch it on. A tier
   that is unreachable from where the reader is sits on the engine's side of
   the question.

## Solution overview

- `readerLocation(env)` → `'remote' | 'local' | null`, a pure function:
  `SKITTERSPEC_READER` wins, then `SSH_CONNECTION` → `'remote'`, else `null`.
- `reviewTierStack({ …, reader })`: when `reader === 'remote'` and the network
  tier has a URL, mark `local` `hidden`. When the network tier has no URL, add
  the not-reachable note instead.
- `reviewTierLine(t)` returns no line for a hidden tier. Callers drop the
  empty entry.
- The coverage line is derived from the visible served tiers:
  `the wait covers network` / `the wait covers local + network`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Env var | add | `SKITTERSPEC_READER` = `remote` \| `local` |
| Env var | update | `SSH_CONNECTION` read as a remote-reader hint |
| JSON field | add | `tiers[].hidden`, `tiers[].reason`; `covers` |
| CLI output | update | review / epic / tada / re-show stacks omit hidden `local` |
| Skill/rule | update | `spec-reports.md` tier rule; banner coverage line in skills |
| Docs | update | `docs/review.html` tiers section |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine: reader signal and stack | ✅ | [01-engine-reader-signal.md](01-engine-reader-signal.md) |
| 2 | Contract, skills and docs | ✅ | [02-contract-and-docs.md](02-contract-and-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-17 — Spec created. The premise shifted mid-grill. The question
  started as "is local ever useful?" (answer: yes, on the same machine). It
  became "local points at the wrong machine when the engine runs in a VM", and
  that fact is what scopes this spec.
- 2026-11-17 — Phase 1 changed course. The engine already had a reader
  signal (`detectReader`/`resolveReader`, plus a committed `review.reader`
  key), so no new `readerLocation` was added. `SKITTERSPEC_READER` now goes
  first in `resolveReader` and outranks the committed key, because the wrapper
  speaks for this machine. `readerOffMachine` hides `local` for the env var,
  the committed setting and ssh, but not for a bridge session: that is often a
  browser on the same machine, and its variable is undocumented. Decision 3's
  "rejected a committed key" still holds, in the sense that no new key was
  added.
- 2026-11-17 — Two test files assumed the run's environment, so a suite run
  inside the VM would have failed. They now scrub `SKITTERSPEC_READER` (and the
  ssh/bridge variables). Checked by running the whole common suite with
  `SKITTERSPEC_READER=remote` set.
- 2026-11-17 — Phase 2 changed the contract instead of the four skill
  banners. The amendment says the holding line names the engine's `covers` and
  that a hidden tier is never printed, so the templates keep their common-case
  wording rather than becoming placeholders.
- 2026-11-17 — Completed; all phases done, tests green (5147).
