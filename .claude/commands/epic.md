---
description: What every member of an epic needs next, in which tab, and the epic page — bare uses the epic or member worktree you are in
argument-hint: "[<epic>]"
allowed-tools: Bash(pnpm exec skitterspec epic status:*)
disable-model-invocation: true
---
!`pnpm exec skitterspec epic status $ARGUMENTS`

Relay the engine output above verbatim. Add nothing and run nothing else.

**It is for coming back to the epic's tab.** Each member is built in a tab of
its own; this one is where you return to see what each needs. On a phone the
in-app browser closes to switch tabs, so the epic page's link is what you came
back for — it is the last thing printed.

**It reads, and nothing more.** It starts no server, claims no pass and runs no
member's next command: those are typed in that member's own tab. A waiting pass
it names is picked up there with `/spec-reviewed`.

**Only you can run it**, for `/spec-connect`'s reason: there is no judgement to
apply, so no model turn is spent finding one.
