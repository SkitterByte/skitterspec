---
github_identifier: "#228"
github_url: "https://github.com/SkitterByte/skitterspec/issues/228"
---

# Hide the local review link on a Windows session with no desktop

> **Type:** Feature
> **Name:** feat-review-reader-no-session (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/228
> **Author:** Reuben Greaves
> **Raised:** 2026-11-18
> **Area:** packages/common/src/env/review.js, packages/common/src/cli.js, packages/common/assets/rules/spec-reports.md, packages/common/assets/core/env.config.md, docs/review.html, packages/common/test/
> **Stack:** worktree
> **Docs:** review

## Summary

When skitterspec runs on Windows in a session with no interactive desktop, the
review stack hides the `local` link and leads with `network`, as it already
does for SSH. Examples are a Mac driving a Windows VM through `prlctl exec`, the
OpenSSH server, or a scheduled task. No wrapper has to set
`SKITTERSPEC_READER=remote` for it.

## Problem

`feat-review-remote-reader` hid `local` only when given an explicit signal:
`SKITTERSPEC_READER`, the committed `review.reader`, or SSH. Because the
operator's `vm` wrapper (`prlctl exec`) shows the engine no SSH variable, the
fix depends on a variable someone has to remember to set in every wrapper on
every machine. The setting describes the session rather than the person, so it
is the kind of fact that can be detected.

Windows sets `SESSIONNAME` for every interactive logon: `Console` at the
desktop and `RDP-Tcp#N` over Remote Desktop. Programs started from that desktop
inherit it, including terminals, IDEs and Claude Code. It is absent for
processes outside any desktop. Verified on 2026-11-18: in the VM's own
PowerShell `$env:SESSIONNAME` is `Console`, and under `vm` it is absent.

## Acceptance criteria

- On win32 with `SESSIONNAME` unset and the other signals absent, the stack
  prints no `local:` line, `network:` comes first, and the `reader:` line
  carries the reason `no interactive session`.
- On win32 with `SESSIONNAME=Console` or `RDP-Tcp#0`, the stack is unchanged.
- On darwin and linux, a missing `SESSIONNAME` changes nothing.
- `SKITTERSPEC_READER=local` brings `local` back. A committed
  `review.reader: local` does too.
- With no network URL, `local` stays, annotated as unreachable, as it does
  today.
- The Windows CI run is green. The CLI render tests state their session rather
  than inheriting the runner's.

## Decisions

1. **This detection may hide a link because a wrong guess costs very little.**
   `local` is hidden only while `network` has a URL, and that URL is the same
   server, so it opens from the engine's own machine too. If a reader really is
   on the engine's machine and this guesses wrong, they get the second-best
   link: plain http, with no clipboard. Nothing breaks. Detection was harmful
   before (the `detectReader` comment) because it decided whether to *serve*,
   and getting that wrong removed the verdict loop. This spec amends the
   rule's sentence "Detection decides nothing here" and states this argument
   for doing so.
2. **The rule checks the session, not the hypervisor.** "No interactive
   desktop" is the fact that matters, and it also covers SSH into Windows and
   scheduled tasks.
   - Rejected: the `prl_tools_service.exe` parent process, because it is
     specific to one vendor and fragile.
   - Rejected: detecting a hypervisor, because a browser inside the VM's own
     desktop wants `local`.
   - Rejected: comparing Claude Code's platform with the engine's, because the
     engine cannot see the harness.
3. **It applies on win32 only.** On other platforms `SESSIONNAME` means
   nothing, so its absence is not evidence (`negative-checks.md` rule 1).
   `detectReader` receives the platform as an argument, as it receives `env`.
   The platform defaults to *none*, so a caller that does not pass one, and
   every existing test, keeps today's behaviour on any machine.
4. **The precedence is unchanged.** It is `SKITTERSPEC_READER`, then
   `review.reader`, then detection. Detection checks SSH first, then the bridge
   session, then the new rule, so `ssh` stays the reason given when both
   apply. The bridge session still does not hide `local`.
5. **It feeds the existing path.** The rule returns
   `{ reader: 'remote', why: 'no interactive session' }`.
   `readerOffMachine` already counts any `remote` except a bridge session, so
   the tier stack, `covers` and the JSON `hidden` reason need no new code. A
   remote reader also binds every interface, which the review server already
   does under `--host 0.0.0.0`.
6. **Tests state their session.** The CLI render tests merge `process.env`
   into a child process. A GitHub Windows runner is a service with no
   `SESSIONNAME`, so the new rule would hide `local` there and break every
   test that expects it. Each test that expects today's stack sets
   `SESSIONNAME=Console` (or `SKITTERSPEC_READER=local`) explicitly. That is
   the same lesson as `bug-no-shell-test-windows`.

## Solution overview

```js
function detectReader(env = {}, platform = null) {
  if (env.SSH_CONNECTION || env.SSH_TTY) return { reader: 'remote', why: 'ssh' }
  if (env.CLAUDE_CODE_BRIDGE_SESSION_ID) return { reader: 'remote', why: 'bridge session' }
  if (platform === 'win32' && !env.SESSIONNAME) return { reader: 'remote', why: 'no interactive session' }
  return { reader: 'unknown', why: null }
}
```

`resolveReader(config, env, platform)` passes the platform through. The four
`cli.js` call sites pass `process.platform`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Business rule | update | win32 with no `SESSIONNAME` gives a remote reader, so `local` is hidden |
| Service | update | `detectReader(env, platform)`, `resolveReader(config, env, platform)` |
| Skill/rule | update | `spec-reports.md`: the third amendment's "Detection decides nothing" |
| Config key | update | `review.reader` doc names the new detection |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Detect the desktop-less Windows session | ⬜ | [01-detect-no-session.md](01-detect-no-session.md) |

## Open questions

- None

## Changelog

- 2026-11-18 — Spec created.
