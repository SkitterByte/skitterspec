---
description: Let this session work on another skitterspec project — name it (or its path); `off` guards it again
argument-hint: "<project> [off]"
allowed-tools: Bash({{exec}} skitterspec spec-env project allow:*)
disable-model-invocation: true
---
!`{{exec}} skitterspec spec-env project allow $ARGUMENTS`

Relay the engine output above verbatim. Add nothing and run nothing else.

**Only you can run this, and that is the whole guard.** The project-guard hook
refuses a write, a `git` change or a `skitterspec` lifecycle command aimed at a
skitterspec project other than the one this session was started in. Its refusal
names two exits: open a session in that project and do the work there, or have
you lift the guard. Claude can take the first and can never take the second — a
guard the model can lift is decoration, which is the line `/allow-base` draws.

**Name the project the refusal named.** `/allow-project ereqs` lifts it for that
folder name; a path (`/allow-project ../ereqs`) pins it to that exact repo.

**It lapses with the session.** The lift is recorded against this session, so
a new session is guarded again. Where the harness exposes no session id it
degrades to a repo-wide lift that lasts until `/allow-project <project> off`;
the engine says which kind you got.

**It is machine-local and gitignored.** The project-wide switch is
`guards.projectBoundary` in `specs/.core/env.config.json`, and turning that off
is a different, committed decision.
