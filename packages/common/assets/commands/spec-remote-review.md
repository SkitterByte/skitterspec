---
description: Permit or forbid publishing a review for a reader off your network — bare toggles it, `on`/`off` set it explicitly
argument-hint: "[on | off]"
allowed-tools: Bash({{exec}} skitterspec spec-env review allow remote:*)
disable-model-invocation: true
---
!`{{exec}} skitterspec spec-env review allow remote --set "$ARGUMENTS"`

Relay the engine output above verbatim. Add nothing and run nothing else.

**Bare toggles.** That is the common case: you are looking at a render whose
`remote:` line says which way it currently is, and what you want is the other
one. `on` and `off` are there for when you are not looking at it.

**It permits publishing; it publishes nothing.** A published page is one
skitterspec cannot delete, so publishing stays an explicit ask
(`/spec-diff` §6) — and a verdict pressed on one needs `/spec-reviewed`, because
nothing pushes from an artifact's store into a conversation.

**It writes a committed file.** `specs/.core/env.config.json` in the primary
checkout, whichever tree you ran this from — so it changes for everyone who
pulls and leaves that tree dirty. The engine says so; do not soften it.
