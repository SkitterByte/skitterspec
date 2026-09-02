# A credentials store for the Linear API key

> **Type:** Feature
> **Name:** feat-linear-credentials-store (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — all phases done (2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** packages/linear/src/credentials.js (new), packages/linear/src/api.js, packages/linear/src/cli-sync.js, packages/linear/assets/skills/spec-linear-setup/SKILL.md, packages/linear/assets/core/linear.config.md
> **Stack:** worktree

## Problem

The Linear personal API key — which makes pushes take the fast direct-API path
instead of MCP — can only come from an environment variable. There is no `.env`
loading and no user-level config anywhere in the codebase, so every user invents
their own answer: a gitignored dotfile, a shell snippet to `source`, a hand-made
config directory. `/spec-linear-setup` currently says the key "never lives in the
config" and points at the docs, which hands the problem back rather than solving
it.

The committed `specs/.core/linear.config.json` deliberately stores only the
*name* of an env var, never a value. Any fix has to keep that property, so
"just put the key in the config" is not available.

## Decisions

1. **A resolution chain, env var first.** `$LINEAR_API_KEY` (or whatever
   `auth.keyEnv` names) still wins, so CI and every existing setup keep working
   untouched. Then the user-level credentials file, then an optional
   `keyCommand`. Purely additive: `resolveApiKey` already returns
   `{ ok: false }` as a *normal* state meaning "fall back to MCP" rather than
   throwing, so extra sources slot in without disturbing the no-key path.
2. **One user-level file, outside every repo:** `$XDG_CONFIG_HOME/skitterspec/
   credentials.json` (falling back to `~/.config/…`), mode `0600`. One place for
   all repos, and it physically cannot be committed by accident. Rejected a
   `.env` in the repo: skitterspec is installed across many repos, and that
   multiplies the number of places a live secret sits.
3. **The model never sees the key.** This is the governing constraint, not a
   nicety: a secret pasted into a chat enters the transcript, is sent to the
   model, and may be logged. Relocating where a key is stored is worthless if it
   travels through the conversation to get there. So the work splits in two —
   an **LLM-facing** path that scaffolds and reports readiness, and a
   **human-facing** command the user runs themselves to set the value.
4. **`/spec-linear-setup` checks and points; it never captures.** It confirms the
   store exists with the right permissions, reports whether a key is present
   (masked), and prints the exact command to run. Rejected prompting for the key
   inside the interview, which was the original plan — see decision 3.
5. **The setter is interactive only.** `credentials set` prompts on a TTY with
   echo off, plus `--stdin` for piping. **No `--key <value>` argument at all**: a
   secret in argv leaks into shell history and `ps`. CI has no need for it —
   that is what the env var is for.
6. **Never print the key back.** `credentials status` reports the source and a
   masked fingerprint (last 4), never the value — so it is safe for a skill to
   run and safe to paste into an issue.
7. **Refuse an over-permissive store**, ssh-style: if the file is group- or
   world-readable, report it and name the `chmod` rather than reading it or
   silently fixing someone's file.
8. **`keyCommand` is honoured from the user-level file ONLY — never from the
   repo's config.** `linear.config.json` is committed and shared; if it could
   name a command, cloning a repo and running `spec-sync` would execute
   arbitrary code from a file a stranger wrote. The repo config keeps naming
   only an env var, exactly as today. This is the sharpest edge in the spec.

## Solution overview

Resolution order, first hit wins:

```
1. process.env[auth.keyEnv]                 (default LINEAR_API_KEY) — CI, unchanged
2. credentials.json → teams[<teamId>].key   — this spec
3. credentials.json → teams[<teamId>].keyCommand  — shells out, trims stdout
```

The store, `0600`, keyed by team id so one file serves every repo:

```json
{
  "version": 1,
  "teams": {
    "e07c2b54-…": { "key": "lin_api_…" },
    "2bb9baee-…": { "keyCommand": "op read op://vault/linear/token" }
  }
}
```

The two halves:

```
# LLM-facing — readiness only, never the value
$ skitterspec spec-sync credentials status
  store:  ~/.config/skitterspec/credentials.json (0600)
  team:   e07c2b54 (SKS)
  key:    not set
  → run this yourself:  skitterspec spec-sync credentials set

# human-facing — run outside the LLM
$ skitterspec spec-sync credentials set
  Linear personal API key for team SKS (input hidden): ****
  stored in ~/.config/skitterspec/credentials.json (0600)
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync credentials <status\|set\|unset>` |
| Module | add | `linear/src/credentials.js` — read, write, permission guard |
| Config file | add | `$XDG_CONFIG_HOME/skitterspec/credentials.json` (0600) |
| Config key | add | `teams.<id>.keyCommand` — user-level file only |
| Auth resolution | update | `resolveApiKey` gains the chain below the env var |
| Skill/rule | update | `/spec-linear-setup` checks readiness and points at the command |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The store and the resolution chain (read side) | ✅ | [01-store-and-resolution.md](01-store-and-resolution.md) |
| 2 | Set it out-of-band; check it from the skill | ✅ | [02-set-and-check.md](02-set-and-check.md) |
| 3 | Delegate to a password manager via keyCommand | ✅ | [03-key-command.md](03-key-command.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | Ready | backlog | Reuben Greaves |
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-02 — Phase 3: `set --command` refuses a command with a key embedded in
  it. Refusing `--key` made that the obvious workaround, and it leaks worse — a
  command is displayed by `status` and stored in clear.
- 2026-09-02 — Phase 2: `--key` is parsed-and-discarded rather than left
  unrecognised — an unparsed flag falls through to `positional` and the secret
  would be echoed in a usage message, refusing it while leaking it.
- 2026-09-02 — Phase 1: `resolveApiKey` skips the store lookup entirely when no
  `teamId` is configured. Discovered while implementing — without it, unit tests
  using the default config read the real `~/.config` and the suite becomes
  machine-dependent. Also correct on its own terms: the store is keyed by team.
- 2026-09-02 — Spec created. An earlier shape had `/spec-linear-setup` prompt
  for the key and store it; rejected, because that routes a secret through the
  conversation. Split into a scaffold/report half and a human-run setter.
